import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "webhook_failed"
  | "chargeback_received"
  | "integration_disconnected"
  | "meta_sync_failed"
  | "meta_token_expiring"
  | "high_refund_rate";

/** Creates a notification once per `dedupeKey`. Never throws: alerting must not break ingestion. */
export async function notify(
  db: SupabaseClient,
  scope: { organizationId: string; projectId: string },
  n: { type: NotificationType; title: string; body?: string; link?: string; dedupeKey: string },
) {
  const { error } = await db.from("notifications").upsert(
    {
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      dedupe_key: n.dedupeKey,
    },
    { onConflict: "project_id,dedupe_key", ignoreDuplicates: true },
  );
  if (error) console.error("[notify] failed", { type: n.type, code: error.code });
}
