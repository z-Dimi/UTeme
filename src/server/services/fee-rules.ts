import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFinancialSnapshot,
  calculateProductCost,
  calculateTaxes,
  resolveFeeRule,
  type FeeRule,
  type FinancialSnapshot,
} from "@/lib/finance";
import type { NormalizedOrderEvent } from "@/server/adapters/types";

export type RuleKind = "gateway_fee" | "tax" | "product_cost" | "meta_ads_tax";

export type RuleSet = Record<RuleKind, FeeRule[]>;

type RuleRow = {
  id: string;
  kind: RuleKind;
  provider: string | null;
  external_product_id: string | null;
  payment_method: string | null;
  installment_min: number | null;
  installment_max: number | null;
  percentage: number | string;
  fixed_amount: number;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
};

export function toFeeRule(row: RuleRow): FeeRule {
  return {
    id: row.id,
    provider: row.provider,
    productId: row.external_product_id,
    paymentMethod: row.payment_method,
    installmentMin: row.installment_min,
    installmentMax: row.installment_max,
    percentage: Number(row.percentage),
    fixedAmount: Number(row.fixed_amount),
    validFrom: new Date(row.valid_from),
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    active: row.active,
  };
}

export function groupRules(rows: RuleRow[]): RuleSet {
  const set: RuleSet = { gateway_fee: [], tax: [], product_cost: [], meta_ads_tax: [] };
  for (const r of rows) set[r.kind].push(toFeeRule(r));
  return set;
}

export async function loadRules(db: SupabaseClient, projectId: string): Promise<RuleSet> {
  const { data, error } = await db
    .from("fee_rules")
    .select(
      "id, kind, provider, external_product_id, payment_method, installment_min, installment_max, percentage, fixed_amount, valid_from, valid_until, active",
    )
    .eq("project_id", projectId);
  if (error) throw new Error(`load fee rules: ${error.message}`);
  return groupRules((data ?? []) as RuleRow[]);
}

export type OrderFinancials = {
  feeRuleId: string | null;
  gatewayFeeAmount: number;
  taxAmount: number;
  productCostAmount: number;
  snapshot: FinancialSnapshot & { taxRuleId: string | null; productCostRuleIds: string[] };
};

/**
 * Resolves the rules valid at the sale instant and freezes the result.
 * Revenue tax is a percentage of gross; product cost is per line (fixed per unit, or % of the line).
 */
export function computeOrderFinancials(rules: RuleSet, event: NormalizedOrderEvent, now = new Date()): OrderFinancials {
  const at = new Date(event.occurredAt);
  const sale = {
    provider: event.provider,
    paymentMethod: event.paymentMethod,
    installments: event.installments,
    occurredAt: at,
  };

  const feeRule = resolveFeeRule(rules.gateway_fee, sale);
  const taxRule = resolveFeeRule(rules.tax, sale);

  let productCost = 0;
  const productCostRuleIds: string[] = [];
  for (const p of event.products) {
    const rule = resolveFeeRule(rules.product_cost, { ...sale, productId: p.id });
    if (!rule) continue;
    productCostRuleIds.push(rule.id);
    productCost += calculateProductCost(
      { quantity: p.quantity, unitAmount: p.unitAmount },
      rule.fixedAmount > 0
        ? { kind: "fixed_per_unit", amount: rule.fixedAmount }
        : { kind: "percent_of_sale", percentage: rule.percentage },
    );
  }

  const base = buildFinancialSnapshot({
    gross: event.grossAmount,
    feeRule,
    taxPercentage: taxRule ? taxRule.percentage : null,
    productCost,
    now,
  });

  return {
    feeRuleId: feeRule?.id ?? null,
    gatewayFeeAmount: base.gatewayFeeAmount,
    taxAmount: taxRule ? calculateTaxes(event.grossAmount, taxRule.percentage) : 0,
    productCostAmount: productCost,
    snapshot: { ...base, taxRuleId: taxRule?.id ?? null, productCostRuleIds },
  };
}
