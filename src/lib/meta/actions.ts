import { decimalToCents } from "@/lib/money";

/**
 * Central mapper for Meta `actions` / `action_values`.
 *
 * Meta reports the SAME conversion under several action types (e.g. `omni_purchase`, `purchase`,
 * `offsite_conversion.fb_pixel_purchase`). Summing them would multiply the real number, so for each
 * business event we take exactly ONE type: the first present in a fixed priority list.
 */
export type MetaActionRow = { action_type: string; value: string };

export type ConversionKind = "purchase" | "initiate_checkout" | "add_to_cart" | "view_content" | "lead" | "landing_page_view";

export const ACTION_PRIORITY: Record<ConversionKind, string[]> = {
  purchase: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  initiate_checkout: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
  add_to_cart: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
  view_content: ["omni_view_content", "view_content", "offsite_conversion.fb_pixel_view_content"],
  lead: ["lead", "offsite_conversion.fb_pixel_lead"],
  landing_page_view: ["landing_page_view"],
};

function pick(rows: MetaActionRow[] | undefined, kind: ConversionKind): MetaActionRow | null {
  if (!rows?.length) return null;
  for (const type of ACTION_PRIORITY[kind]) {
    const hit = rows.find((r) => r.action_type === type);
    if (hit) return hit;
  }
  return null;
}

/** Count of the conversion (0 when Meta reported none). */
export function conversionCount(rows: MetaActionRow[] | undefined, kind: ConversionKind): number {
  const hit = pick(rows, kind);
  const n = hit ? Math.round(Number(hit.value)) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Conversion value in cents (0 when none). */
export function conversionValueCents(rows: MetaActionRow[] | undefined, kind: ConversionKind): number {
  const hit = pick(rows, kind);
  const n = hit ? Number(hit.value) : 0;
  return Number.isFinite(n) ? decimalToCents(n) : 0;
}

/** `outbound_clicks` comes as [{ action_type: "outbound_click", value }]. */
export function outboundClicks(rows: MetaActionRow[] | undefined): number {
  const n = Math.round(Number(rows?.find((r) => r.action_type === "outbound_click")?.value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export type InsightRow = {
  date_start: string;
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  outbound_clicks?: MetaActionRow[];
  actions?: MetaActionRow[];
  action_values?: MetaActionRow[];
};

const int = (v: string | undefined) => {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export type MetricsRow = {
  date: string;
  ad_account_id: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inline_link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  meta_purchases: number;
  meta_purchase_value: number;
  meta_initiate_checkouts: number;
  meta_add_to_carts: number;
  meta_view_contents: number;
  meta_leads: number;
  actions: MetaActionRow[] | null;
  action_values: MetaActionRow[] | null;
};

/** Returns null for rows without an ad id (Meta can return account-level remainders). */
export function mapInsightRow(row: InsightRow, projectAccountId: string): MetricsRow | null {
  if (!row.ad_id || !row.adset_id || !row.campaign_id) return null;
  return {
    date: row.date_start,
    ad_account_id: projectAccountId,
    campaign_id: row.campaign_id,
    adset_id: row.adset_id,
    ad_id: row.ad_id,
    spend: row.spend ? decimalToCents(Number(row.spend)) : 0,
    impressions: int(row.impressions),
    reach: int(row.reach),
    clicks: int(row.clicks),
    inline_link_clicks: int(row.inline_link_clicks),
    outbound_clicks: outboundClicks(row.outbound_clicks),
    landing_page_views: conversionCount(row.actions, "landing_page_view"),
    meta_purchases: conversionCount(row.actions, "purchase"),
    meta_purchase_value: conversionValueCents(row.action_values, "purchase"),
    meta_initiate_checkouts: conversionCount(row.actions, "initiate_checkout"),
    meta_add_to_carts: conversionCount(row.actions, "add_to_cart"),
    meta_view_contents: conversionCount(row.actions, "view_content"),
    meta_leads: conversionCount(row.actions, "lead"),
    actions: row.actions ?? null,
    action_values: row.action_values ?? null,
  };
}
