export type FunnelSource = "meta" | "gateway";

export type FunnelStageData = {
  key: "clicks" | "landing_page_views" | "initiate_checkouts" | "meta_purchases" | "approved_sales";
  label: string;
  /** null = not available. Never replaced by zero or an estimate. */
  value: number | null;
  source: FunnelSource;
};

export type MetaFunnelInput = {
  clicks: number | null;
  landingPageViews: number | null;
  initiateCheckouts: number | null;
  metaPurchases: number | null;
};

/**
 * Single place that defines the conversion funnel. Meta stages come from synced Meta insights,
 * the last stage from the payment gateway. Missing stages stay `null`.
 */
export function getConversionFunnel(meta: MetaFunnelInput | null, approvedSales: number): FunnelStageData[] {
  return [
    { key: "clicks", label: "Cliques", value: meta?.clicks ?? null, source: "meta" },
    { key: "landing_page_views", label: "Vis. Página", value: meta?.landingPageViews ?? null, source: "meta" },
    { key: "initiate_checkouts", label: "ICs", value: meta?.initiateCheckouts ?? null, source: "meta" },
    { key: "meta_purchases", label: "Compras Meta", value: meta?.metaPurchases ?? null, source: "meta" },
    { key: "approved_sales", label: "Vendas Aprov.", value: approvedSales, source: "gateway" },
  ];
}

/**
 * Stages the chart can draw: the first available stage must be the widest (the chart normalizes to it),
 * and we need at least two. Stages that are unavailable are skipped, not zero-filled.
 */
export function chartableStages(stages: FunnelStageData[]): (FunnelStageData & { value: number })[] {
  const available = stages.filter((s): s is FunnelStageData & { value: number } => s.value !== null && s.value > 0);
  if (available.length < 2) return [];
  const head = available[0].value;
  return available.every((s) => s.value <= head) ? available : [];
}
