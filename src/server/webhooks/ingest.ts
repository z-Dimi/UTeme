import "server-only";
import { decryptSecret, sha256Hex } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter, isProviderKey, type ProviderKey } from "@/server/adapters";
import { sanitize } from "@/server/adapters/shared";
import { AdapterError, type ParseResult } from "@/server/adapters/types";
import { applyOrderEvent } from "@/server/services/apply-order-event";
import { notify } from "@/server/services/notify";

export type IngestResponse = { status: number; body: Record<string, unknown> };

const KEPT_HEADERS = ["user-agent", "content-type", "x-cakto-timestamp", "x-webhook-timestamp"];

function safeHeaders(headers: Headers) {
  return Object.fromEntries(KEPT_HEADERS.flatMap((k) => (headers.get(k) ? [[k, headers.get(k)]] : [])));
}

function safePayload(rawBody: string): unknown {
  try {
    return sanitize(JSON.parse(rawBody));
  } catch {
    return { unparsed: true, length: rawBody.length };
  }
}

/**
 * HTTP webhook -> integration -> verify -> persist raw event -> adapter -> ledger.
 * The raw event is always stored before any business rule runs. Once stored we answer 2xx:
 * failures are visible in the inbox and reprocessable, never lost.
 */
export async function ingestWebhook(args: {
  provider: ProviderKey;
  integrationId: string;
  rawBody: string;
  headers: Headers;
}): Promise<IngestResponse> {
  const { provider, integrationId, rawBody, headers } = args;
  const db = createAdminClient();
  const adapter = getAdapter(provider);

  const { data: integration, error: intError } = await db
    .from("integrations")
    .select("id, organization_id, project_id, secret_encrypted, secret_configured, status")
    .eq("id", integrationId)
    .eq("provider", provider)
    .maybeSingle();
  // Same answer for "does not exist" and "inactive": no enumeration.
  if (intError || !integration || integration.status !== "active") {
    return { status: 404, body: { error: "not_found" } };
  }
  // The gateway secret has not been pasted yet: nothing can be authenticated, so nothing is accepted.
  if (!integration.secret_configured) {
    console.warn("[webhook] rejected", { provider, integrationId, reason: "secret_not_configured" });
    return { status: 401, body: { error: "unauthorized" } };
  }

  const verification = adapter.verify({ rawBody, headers, secret: decryptSecret(integration.secret_encrypted) });
  if (!verification.ok) {
    console.warn("[webhook] rejected", { provider, integrationId, reason: verification.reason });
    return { status: 401, body: { error: "unauthorized" } };
  }

  const scope = {
    organizationId: integration.organization_id as string,
    projectId: integration.project_id as string,
    integrationId,
  };

  let parsed: ParseResult | null = null;
  let parseError: string | null = null;
  try {
    parsed = adapter.parse(rawBody);
  } catch (e) {
    if (!(e instanceof AdapterError)) throw e;
    parseError = e.message;
  }

  const deliveryKey = parsed?.deliveryKey ?? sha256Hex(rawBody);
  const first = parsed?.kind === "events" ? parsed.events[0] : null;

  const { data: inserted, error: insertError } = await db
    .from("webhook_events")
    .insert({
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      integration_id: integrationId,
      provider,
      provider_event_id: first?.providerEventId ?? null,
      fingerprint: sha256Hex(`${provider}|${deliveryKey}`),
      event_type: first?.eventType ?? (parsed?.kind === "ignored" ? (parsed.eventType ?? null) : null),
      external_order_id: first?.externalOrderId ?? null,
      payload: safePayload(rawBody),
      headers: safeHeaders(headers),
      status: "processing",
      attempt_count: 1,
    })
    .select("id")
    .single();

  let webhookEventId: string;
  if (insertError?.code === "23505") {
    // Duplicate delivery. Only a previously failed event is worth running again.
    const { data: existing } = await db
      .from("webhook_events")
      .select("id, status, attempt_count")
      .eq("integration_id", integrationId)
      .eq("fingerprint", sha256Hex(`${provider}|${deliveryKey}`))
      .single();
    if (!existing || existing.status !== "failed") {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    await db
      .from("webhook_events")
      .update({ status: "processing", attempt_count: existing.attempt_count + 1, error_message: null })
      .eq("id", existing.id);
    webhookEventId = existing.id;
  } else if (insertError || !inserted) {
    console.error("[webhook] could not persist event", { provider, integrationId, code: insertError?.code });
    return { status: 500, body: { error: "persist_failed" } };
  } else {
    webhookEventId = inserted.id;
  }

  return processParsed(db, scope, provider, parsed, parseError, webhookEventId);
}

type Db = ReturnType<typeof createAdminClient>;
type Scope = { organizationId: string; projectId: string; integrationId: string };

/** Applies an already persisted webhook event and records the outcome. Shared by ingest and reprocess. */
async function processParsed(
  db: Db,
  scope: Scope,
  provider: ProviderKey,
  parsed: ParseResult | null,
  parseError: string | null,
  webhookEventId: string,
): Promise<IngestResponse> {
  const { integrationId } = scope;
  const finish = (status: "processed" | "ignored" | "failed", error?: string) =>
    db
      .from("webhook_events")
      .update({ status, error_message: error ?? null, processed_at: new Date().toISOString() })
      .eq("id", webhookEventId);

  const alertFailure = (message: string) =>
    notify(db, scope, {
      type: "webhook_failed",
      title: "Webhook com erro",
      body: message.slice(0, 300),
      link: `/events/${webhookEventId}`,
      dedupeKey: `webhook_failed:${webhookEventId}`,
    });

  if (!parsed) {
    const message = parseError ?? "invalid payload";
    await finish("failed", message);
    await alertFailure(message);
    return { status: 200, body: { received: true, status: "failed" } };
  }
  if (parsed.kind === "ignored") {
    await finish("ignored", parsed.reason);
    await db.from("integrations").update({ last_event_at: new Date().toISOString() }).eq("id", integrationId);
    return { status: 200, body: { received: true, status: "ignored" } };
  }

  try {
    const results = [];
    for (const event of parsed.events) {
      results.push(await applyOrderEvent(db, scope, event, webhookEventId));
    }
    for (const r of results) {
      if (r.result === "applied" && r.to === "chargeback") {
        await notify(db, scope, {
          type: "chargeback_received",
          title: "Chargeback recebido",
          body: "Um pedido recebeu chargeback e foi removido da receita líquida.",
          link: "/sales",
          dedupeKey: `chargeback:${r.orderId}`,
        });
      }
    }
    const rejected = results.find((r) => r.result === "rejected");
    if (rejected) {
      await finish("ignored", `status regression blocked: ${rejected.from} -> ${rejected.to}`);
    } else {
      await finish("processed");
    }
    await db.from("integrations").update({ last_event_at: new Date().toISOString() }).eq("id", integrationId);
    return { status: 200, body: { received: true, status: rejected ? "ignored" : "processed" } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[webhook] processing failed", { provider, integrationId, webhookEventId, message });
    await finish("failed", message);
    await alertFailure(message);
    return { status: 200, body: { received: true, status: "failed" } };
  }
}

/**
 * Re-runs a failed event through the same pipeline from the stored (sanitized) payload.
 * The original payload is never edited; only status/attempt_count/error change.
 */
export async function reprocessWebhookEvent(args: { eventId: string; projectId: string }): Promise<IngestResponse> {
  const db = createAdminClient();
  const { data: ev } = await db
    .from("webhook_events")
    .select("id, organization_id, project_id, integration_id, provider, payload, status, attempt_count")
    .eq("id", args.eventId)
    .eq("project_id", args.projectId)
    .maybeSingle();
  if (!ev) return { status: 404, body: { error: "not_found" } };
  if (ev.status !== "failed") return { status: 409, body: { error: "only_failed_events_can_be_reprocessed" } };
  if (!isProviderKey(ev.provider)) return { status: 422, body: { error: "unknown_provider" } };

  // Compare-and-set so two clicks cannot run the same event twice.
  const { data: claimed } = await db
    .from("webhook_events")
    .update({ status: "processing", attempt_count: ev.attempt_count + 1, error_message: null })
    .eq("id", ev.id)
    .eq("status", "failed")
    .select("id");
  if (!claimed?.length) return { status: 409, body: { error: "already_processing" } };

  let parsed: ParseResult | null = null;
  let parseError: string | null = null;
  try {
    parsed = getAdapter(ev.provider).parse(JSON.stringify(ev.payload));
  } catch (e) {
    if (!(e instanceof AdapterError)) throw e;
    parseError = e.message;
  }
  const scope = { organizationId: ev.organization_id, projectId: ev.project_id, integrationId: ev.integration_id };
  return processParsed(db, scope, ev.provider, parsed, parseError, ev.id);
}
