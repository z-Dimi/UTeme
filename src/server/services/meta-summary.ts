import "server-only";
import { percentOf, resolveFeeRule } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/dates";
import { toFeeRule } from "./fee-rules";

export type MetaTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  initiateCheckouts: number;
};

export type MetaPeriod =
  | { state: "not_connected" }
  | { state: "importing" }
  | { state: "ready"; totals: MetaTotals; metaAdsTax: number; lastSyncAt: string | null; hasError: boolean };

const n = (v: unknown) => Number(v ?? 0);

/**
 * Meta numbers for the dashboard, read from our own database (never from Meta on page load).
 * Meta's days follow the ad account timezone; we query by the same calendar dates.
 */
export async function getMetaPeriod(args: { projectId: string; period: Period; tz: string }): Promise<MetaPeriod> {
  const { projectId, period, tz } = args;
  const supabase = await createClient();

  const { data: conn } = await supabase
    .from("meta_connections")
    .select("status, ad_account_id, backfill_status, last_sync_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!conn || conn.status === "disconnected" || !conn.ad_account_id) return { state: "not_connected" };
  if (conn.backfill_status !== "done") return { state: "importing" };

  const localDate = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  const [{ data: days, error }, { data: taxRows }] = await Promise.all([
    supabase.rpc("meta_daily", { p_project: projectId, p_from: localDate(period.from), p_to: localDate(period.to) }),
    supabase
      .from("fee_rules")
      .select("id, kind, provider, external_product_id, payment_method, installment_min, installment_max, percentage, fixed_amount, valid_from, valid_until, active")
      .eq("project_id", projectId)
      .eq("kind", "meta_ads_tax"),
  ]);
  if (error) return { state: "not_connected" };

  const taxRules = (taxRows ?? []).map((r) => toFeeRule(r as Parameters<typeof toFeeRule>[0]));
  const totals: MetaTotals = { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, purchases: 0, purchaseValue: 0, initiateCheckouts: 0 };
  let metaAdsTax = 0;

  for (const d of (days ?? []) as Record<string, number | string>[]) {
    totals.spend += n(d.spend);
    totals.impressions += n(d.impressions);
    totals.clicks += n(d.clicks);
    totals.linkClicks += n(d.inline_link_clicks);
    totals.landingPageViews += n(d.landing_page_views);
    totals.purchases += n(d.meta_purchases);
    totals.purchaseValue += n(d.meta_purchase_value);
    totals.initiateCheckouts += n(d.meta_initiate_checkouts);
    // Meta Ads tax applies to spend, using the rule that was valid on that day.
    const rule = resolveFeeRule(taxRules, { provider: "meta", occurredAt: new Date(`${d.date}T12:00:00Z`) });
    if (rule) metaAdsTax += percentOf(n(d.spend), rule.percentage);
  }

  return { state: "ready", totals, metaAdsTax, lastSyncAt: conn.last_sync_at, hasError: conn.status === "error" };
}
