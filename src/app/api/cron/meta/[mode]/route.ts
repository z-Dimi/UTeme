import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECTION_COLUMNS, runIncrementalSync, type MetaConnection } from "@/server/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODES = { live: "live", recent: "recent", reconcile: "reconcile", deep: "deep" } as const;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cron entry points: /api/cron/meta/recent (today+yesterday), /reconcile (7 days), /deep (30 days).
 * Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { mode } = await ctx.params;
  if (!(mode in MODES)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const db = createAdminClient();
  const { data: connections } = await db
    .from("meta_connections")
    .select(CONNECTION_COLUMNS)
    .eq("status", "connected")
    .eq("backfill_status", "done")
    .not("ad_account_id", "is", null)
    .not("access_token_encrypted", "is", null)
    .overrideTypes<MetaConnection[], { merge: false }>();

  let ok = 0;
  let failed = 0;
  // Sequential on purpose: keeps us inside Meta's rate limits; each run is idempotent.
  for (const conn of connections ?? []) {
    try {
      await runIncrementalSync(db, conn, MODES[mode as keyof typeof MODES]);
      ok += 1;
    } catch {
      failed += 1; // already logged, recorded in sync_runs and notified
    }
  }
  return NextResponse.json({ mode, connections: (connections ?? []).length, ok, failed });
}
