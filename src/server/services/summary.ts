import "server-only";
import {
  calculateCashRevenue,
  calculateMargin,
  calculateNetRevenue,
  calculateProfit,
  calculateROAS,
  calculateROI,
  type PeriodTotals,
} from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/dates";

export type Summary = {
  approvedOrders: number;
  refundOrders: number;
  chargebackOrders: number;
  pendingOrders: number;
  grossRevenue: number;
  cashRevenue: number;
  netRevenue: number;
  refunds: number;
  chargebacks: number;
  gatewayFees: number;
  taxes: number;
  productCosts: number;
  pendingAmount: number;
  /** null = ad data not available (Meta not connected / not synced). Never zero by default. */
  adSpend: number | null;
  metaAdsTax: number | null;
  expenses: number;
  profit: number | null;
  roi: number | null;
  roas: number | null;
  margin: number | null;
};

export type HourlyPoint = { hour: number; orders: number; result: number };

const n = (v: unknown) => Number(v ?? 0);

export async function getSummary(args: {
  projectId: string;
  period: Period;
  adSpend: number | null;
  metaAdsTax: number | null;
}): Promise<{ summary: Summary; hourly: HourlyPoint[] } | { error: string }> {
  const supabase = await createClient();
  const { projectId, period, adSpend, metaAdsTax } = args;

  const { data, error } = await supabase
    .rpc("summary_totals", { p_project: projectId, p_from: period.from.toISOString(), p_to: period.to.toISOString() })
    .single<Record<string, number | string>>();
  if (error || !data) return { error: error?.message ?? "no data" };

  const t: PeriodTotals = {
    grossRevenue: n(data.gross_revenue),
    refunds: n(data.refund_amount),
    chargebacks: n(data.chargeback_amount),
    gatewayFees: n(data.gateway_fees),
    taxes: n(data.taxes),
    productCosts: n(data.product_costs),
    adSpend: adSpend ?? 0,
    metaAdsTax: metaAdsTax ?? 0,
    expenses: 0, // expenses module not implemented yet
  };

  const cashRevenue = calculateCashRevenue(t);
  const hasAds = adSpend !== null;

  return {
    summary: {
      approvedOrders: n(data.approved_orders),
      refundOrders: n(data.refund_orders),
      chargebackOrders: n(data.chargeback_orders),
      pendingOrders: n(data.pending_orders),
      grossRevenue: t.grossRevenue,
      cashRevenue,
      netRevenue: calculateNetRevenue(t),
      refunds: t.refunds,
      chargebacks: t.chargebacks,
      gatewayFees: t.gatewayFees,
      taxes: t.taxes,
      productCosts: t.productCosts,
      pendingAmount: n(data.pending_amount),
      adSpend,
      metaAdsTax,
      expenses: t.expenses,
      // Profit/ROI/margin need ad spend: without it they would overstate results, so they stay unavailable.
      profit: hasAds ? calculateProfit(t) : null,
      roi: hasAds ? calculateROI(t) : null,
      roas: hasAds ? calculateROAS(cashRevenue, adSpend) : null,
      margin: hasAds ? calculateMargin(t) : null,
    },
    hourly: await getHourly(projectId, period),
  };
}

async function getHourly(projectId: string, period: Period): Promise<HourlyPoint[]> {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("timezone").eq("id", projectId).single();
  const { data } = await supabase.rpc("hourly_results", {
    p_project: projectId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
    p_tz: project?.timezone ?? "America/Sao_Paulo",
  });
  const byHour = new Map<number, HourlyPoint>(
    ((data ?? []) as { hour: number; orders: number | string; result: number | string }[]).map((r) => [
      r.hour,
      { hour: r.hour, orders: n(r.orders), result: n(r.result) },
    ]),
  );
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, orders: 0, result: 0 });
}
