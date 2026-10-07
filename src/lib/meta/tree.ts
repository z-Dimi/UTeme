import { calculateCPA, calculateROAS } from "@/lib/finance";

export type RollupRow = {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  inline_link_clicks: number;
  meta_purchases: number;
  meta_purchase_value: number;
};

export type NameStatus = { name: string; status: string | null };

export type Sums = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseValue: number;
};

export type Derived = {
  /** clicks / impressions (ratio). null without impressions. */
  ctr: number | null;
  /** cents per click */
  cpc: number | null;
  /** cents per 1000 impressions */
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
};

export type MetaNode = {
  id: string;
  name: string;
  status: string | null;
  sums: Sums;
  derived: Derived;
  children: MetaNode[];
};

const zero = (): Sums => ({ spend: 0, impressions: 0, clicks: 0, linkClicks: 0, purchases: 0, purchaseValue: 0 });

function add(into: Sums, row: Sums) {
  into.spend += row.spend;
  into.impressions += row.impressions;
  into.clicks += row.clicks;
  into.linkClicks += row.linkClicks;
  into.purchases += row.purchases;
  into.purchaseValue += row.purchaseValue;
}

export function derive(s: Sums): Derived {
  return {
    ctr: s.impressions > 0 ? s.clicks / s.impressions : null,
    cpc: s.clicks > 0 ? Math.round(s.spend / s.clicks) : null,
    cpm: s.impressions > 0 ? Math.round((s.spend / s.impressions) * 1000) : null,
    cpa: calculateCPA(s.spend, s.purchases),
    roas: calculateROAS(s.purchaseValue, s.spend),
  };
}

const fromRow = (r: RollupRow): Sums => ({
  spend: Number(r.spend),
  impressions: Number(r.impressions),
  clicks: Number(r.clicks),
  linkClicks: Number(r.inline_link_clicks),
  purchases: Number(r.meta_purchases),
  purchaseValue: Number(r.meta_purchase_value),
});

/**
 * Builds campaign -> ad set -> ad from per-ad period totals. Parents are sums of children, so a
 * campaign can never disagree with its ads. Names/status come from the synced structure; when a
 * name is not known yet the id is shown (never a made-up label).
 */
export function buildMetaTree(
  rows: RollupRow[],
  names: { campaigns: Map<string, NameStatus>; adsets: Map<string, NameStatus>; ads: Map<string, NameStatus> },
): MetaNode[] {
  const campaigns = new Map<string, MetaNode>();
  const adsets = new Map<string, MetaNode>();

  const node = (id: string, map: Map<string, NameStatus>): MetaNode => ({
    id,
    name: map.get(id)?.name ?? id,
    status: map.get(id)?.status ?? null,
    sums: zero(),
    derived: derive(zero()),
    children: [],
  });

  for (const r of rows) {
    const sums = fromRow(r);
    let campaign = campaigns.get(r.campaign_id);
    if (!campaign) campaigns.set(r.campaign_id, (campaign = node(r.campaign_id, names.campaigns)));
    let adset = adsets.get(r.adset_id);
    if (!adset) {
      adsets.set(r.adset_id, (adset = node(r.adset_id, names.adsets)));
      campaign.children.push(adset);
    }
    const ad = node(r.ad_id, names.ads);
    ad.sums = sums;
    adset.children.push(ad);
    add(adset.sums, sums);
    add(campaign.sums, sums);
  }

  const all = [...campaigns.values()];
  for (const c of all) {
    c.derived = derive(c.sums);
    for (const a of c.children) {
      a.derived = derive(a.sums);
      for (const ad of a.children) ad.derived = derive(ad.sums);
    }
  }
  return all;
}

export type SortKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "purchases" | "purchaseValue" | "cpa" | "roas";

export const SORT_KEYS: SortKey[] = ["name", "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "purchases", "purchaseValue", "cpa", "roas"];

export function sortValue(n: MetaNode, key: SortKey): number | string | null {
  switch (key) {
    case "name":
      return n.name.toLowerCase();
    case "spend":
    case "impressions":
    case "clicks":
    case "purchases":
    case "purchaseValue":
      return n.sums[key];
    default:
      return n.derived[key];
  }
}

/** Sorts in place semantics-free (returns a new array). Unavailable values (null) always go last. */
export function sortNodes(nodes: MetaNode[], key: SortKey, dir: "asc" | "desc"): MetaNode[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...nodes].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va < vb ? -sign : va > vb ? sign : 0;
  });
}
