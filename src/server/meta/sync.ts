import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import { addDays, formatYmd, todayInTz, type Ymd } from "@/lib/dates";
import { mapInsightRow, type InsightRow } from "@/lib/meta/actions";
import { notify } from "@/server/services/notify";
import { graphGetAll, MetaApiError } from "./graph";

export type MetaConnection = {
  id: string;
  organization_id: string;
  project_id: string;
  access_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string;
  ad_account_id: string | null;
  ad_account_timezone: string | null;
  backfill_status: string;
  backfill_progress: Record<string, unknown>;
};

export const CONNECTION_COLUMNS =
  "id, organization_id, project_id, access_token_encrypted, token_expires_at, status, ad_account_id, ad_account_timezone, backfill_status, backfill_progress";

const BACKFILL_DAYS = 30;
const WINDOW_DAYS = 7;
const UPSERT_CHUNK = 500;

type Db = SupabaseClient;

const INSIGHT_FIELDS = [
  "date_start",
  "account_id",
  "campaign_id",
  "adset_id",
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "outbound_clicks",
  "actions",
  "action_values",
].join(",");

function tokenOf(conn: MetaConnection): string {
  if (!conn.access_token_encrypted) throw new Error("Meta connection has no token");
  return decryptSecret(conn.access_token_encrypted);
}

async function updateConnection(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("meta_connections").update(patch).eq("id", id);
}

type StructRow = { id: string; name: string; status?: string; effective_status?: string };

/** Campaigns, ad sets and ads of the selected account. */
export async function syncStructure(db: Db, conn: MetaConnection) {
  const token = tokenOf(conn);
  const account = conn.ad_account_id!;
  const scope = { organization_id: conn.organization_id, project_id: conn.project_id };
  const now = new Date().toISOString();
  const status = (r: StructRow) => r.effective_status ?? r.status ?? null;

  const campaigns = await graphGetAll<StructRow & { objective?: string }>(
    `${account}/campaigns`,
    { fields: "id,name,status,effective_status,objective", limit: 500 },
    token,
  );
  const adsets = await graphGetAll<StructRow & { campaign_id: string }>(
    `${account}/adsets`,
    { fields: "id,name,status,effective_status,campaign_id", limit: 500 },
    token,
  );
  const ads = await graphGetAll<StructRow & { adset_id: string; campaign_id: string }>(
    `${account}/ads`,
    { fields: "id,name,status,effective_status,adset_id,campaign_id", limit: 500 },
    token,
  );

  const upsert = async (table: string, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "project_id,external_id" });
      if (error) throw new Error(`upsert ${table}: ${error.message}`);
    }
  };
  await upsert("meta_campaigns", campaigns.map((c) => ({ ...scope, external_id: c.id, name: c.name, status: status(c), objective: c.objective ?? null, updated_at: now })));
  await upsert("meta_adsets", adsets.map((a) => ({ ...scope, external_id: a.id, campaign_external_id: a.campaign_id, name: a.name, status: status(a), updated_at: now })));
  await upsert("meta_ads", ads.map((a) => ({ ...scope, external_id: a.id, adset_external_id: a.adset_id, campaign_external_id: a.campaign_id, name: a.name, status: status(a), updated_at: now })));

  return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
}

/** Ad-level daily insights for [since, until] (inclusive, account timezone dates). Idempotent upsert. */
export async function syncInsights(db: Db, conn: MetaConnection, since: string, until: string): Promise<number> {
  const token = tokenOf(conn);
  const account = conn.ad_account_id!;
  const rows = await graphGetAll<InsightRow>(
    `${account}/insights`,
    {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHT_FIELDS,
      limit: 500,
    },
    token,
  );

  const mapped = rows
    .map((r) => mapInsightRow(r, account))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ ...r, organization_id: conn.organization_id, project_id: conn.project_id, synced_at: new Date().toISOString() }));

  for (let i = 0; i < mapped.length; i += UPSERT_CHUNK) {
    const { error } = await db
      .from("meta_metrics_daily")
      .upsert(mapped.slice(i, i + UPSERT_CHUNK), { onConflict: "project_id,date,ad_id" });
    if (error) throw new Error(`upsert insights: ${error.message}`);
  }
  return mapped.length;
}

/** Calendar "today" in the ad account's timezone (Meta's days follow the account, not the project). */
function accountToday(conn: MetaConnection): Ymd {
  return todayInTz(new Date(), conn.ad_account_timezone ?? "America/Sao_Paulo");
}

/**
 * Wraps a sync with its bookkeeping (sync_runs, last_sync_at, error + notification).
 * `quiet` runs (the every-minute "live" sync) only leave a sync_runs row when they FAIL, so the table
 * does not grow by 1,440 rows a day per project.
 */
async function withRun<T>(
  db: Db,
  conn: MetaConnection,
  type: string,
  fn: () => Promise<{ records: number; value: T }>,
  opts: { quiet?: boolean } = {},
) {
  const { data: run } = opts.quiet
    ? { data: null }
    : await db
        .from("sync_runs")
        .insert({ organization_id: conn.organization_id, project_id: conn.project_id, provider: "meta", type })
        .select("id")
        .single();
  try {
    const { records, value } = await fn();
    if (run) await db.from("sync_runs").update({ status: "success", finished_at: new Date().toISOString(), records_processed: records }).eq("id", run.id);
    await updateConnection(db, conn.id, { last_sync_at: new Date().toISOString(), last_error: null, status: "connected" });
    const msLeft = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() - Date.now() : null;
    if (msLeft !== null && msLeft < 7 * 24 * 3600 * 1000) {
      await notify(db, { organizationId: conn.organization_id, projectId: conn.project_id }, {
        type: "meta_token_expiring",
        title: "A conexão com a Meta expira em breve",
        body: "Reconecte sua conta em Integrações antes que a sincronização pare.",
        link: "/integrations/meta",
        dedupeKey: `meta_token_expiring:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return value;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    const authError = e instanceof MetaApiError && e.isAuthError;
    console.error("[meta-sync] failed", { type, projectId: conn.project_id, code: e instanceof MetaApiError ? e.code : undefined, message });
    if (run) {
      await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: message.slice(0, 500) }).eq("id", run.id);
    } else {
      await db.from("sync_runs").insert({
        organization_id: conn.organization_id,
        project_id: conn.project_id,
        provider: "meta",
        type,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message.slice(0, 500),
      });
    }
    await updateConnection(db, conn.id, { last_error: message.slice(0, 500), status: authError ? "error" : "connected" });
    await notify(db, { organizationId: conn.organization_id, projectId: conn.project_id }, {
      type: "meta_sync_failed",
      title: authError ? "Conexão com a Meta expirou" : "Falha ao sincronizar a Meta",
      body: authError ? "Reconecte sua conta em Integrações para voltar a atualizar os dados." : message.slice(0, 300),
      link: "/integrations",
      // one alert per day per condition
      dedupeKey: `meta_sync_failed:${authError ? "auth" : "sync"}:${new Date().toISOString().slice(0, 10)}`,
    });
    throw e;
  }
}

/** First connection: structure + last 30 days in 7-day windows, with persisted progress. Resumable. */
export async function runBackfill(db: Db, conn: MetaConnection) {
  const progress: Record<string, unknown> = { step: "structure", days: BACKFILL_DAYS };
  const save = (patch: Record<string, unknown>) => {
    Object.assign(progress, patch);
    return updateConnection(db, conn.id, { backfill_progress: progress });
  };
  await updateConnection(db, conn.id, { backfill_status: "running", backfill_progress: progress });

  try {
    await withRun(db, conn, "backfill", async () => {
      const struct = await syncStructure(db, conn);
      await save({ step: "insights", ...struct, windows_done: 0, windows_total: Math.ceil(BACKFILL_DAYS / WINDOW_DAYS) });

      const today = accountToday(conn);
      let records = 0;
      let done = 0;
      // Newest window first, so "today" and "yesterday" are usable as early as possible.
      for (let offset = 0; offset < BACKFILL_DAYS; offset += WINDOW_DAYS) {
        const until = addDays(today, -offset);
        const since = addDays(today, -Math.min(offset + WINDOW_DAYS - 1, BACKFILL_DAYS - 1));
        records += await syncInsights(db, conn, formatYmd(since), formatYmd(until));
        done += 1;
        await save({ windows_done: done, records });
      }
      return { records, value: null };
    });
    await save({ step: "done" });
    await updateConnection(db, conn.id, { backfill_status: "done" });
  } catch (e) {
    await save({ step: "failed" });
    await updateConnection(db, conn.id, { backfill_status: "failed" });
    throw e;
  }
}

/**
 * Recent sync. Meta may re-attribute conversions after the fact, so recent days are always re-fetched:
 *  - "live": TODAY only, one insights call, no structure. Meant to run about every minute so spend/ROAS
 *    follow the day; in the first hours after midnight it also re-reads yesterday's closing numbers.
 *  - "recent": today + yesterday + campaign/ad names (manual "Atualizar")
 *  - "reconcile": last 7 days; "deep": last 30 days (infrequent)
 */
export type SyncMode = "live" | "recent" | "reconcile" | "deep";

/** Hour (0-23) in the ad account's timezone. */
function accountHour(conn: MetaConnection): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: conn.ad_account_timezone ?? "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date());
  return Number(h);
}

export async function runIncrementalSync(db: Db, conn: MetaConnection, mode: SyncMode) {
  const today = accountToday(conn);
  const days = mode === "live" ? (accountHour(conn) < 3 ? 2 : 1) : mode === "recent" ? 2 : mode === "reconcile" ? 7 : 30;
  await withRun(
    db,
    conn,
    mode,
    async () => {
      let records = 0;
      if (mode !== "live") await syncStructure(db, conn); // names/status of new campaigns and ads
      records += await syncInsights(db, conn, formatYmd(addDays(today, -(days - 1))), formatYmd(today));
      return { records, value: null };
    },
    { quiet: mode === "live" },
  );
}
