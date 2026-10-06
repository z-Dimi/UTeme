/**
 * Central financial engine. Pure functions, integer cents everywhere.
 * See docs/FINANCE.md for definitions. Do not re-implement these in components.
 */

export type Cents = number;

// ------------------------------------------------------------------ fee rules

export type FeeRule = {
  id: string;
  /** null = applies to any provider (organization default). */
  provider: string | null;
  productId: string | null;
  paymentMethod: string | null;
  installmentMin: number | null;
  installmentMax: number | null;
  /** Percent, e.g. 4.99 means 4.99%. */
  percentage: number;
  fixedAmount: Cents;
  validFrom: Date;
  /** Exclusive upper bound; null = open ended. */
  validUntil: Date | null;
  active: boolean;
};

export type SaleContext = {
  provider: string;
  productId?: string | null;
  paymentMethod?: string | null;
  installments?: number | null;
  /** Moment the sale happened; rules are resolved by validity at this instant. */
  occurredAt: Date;
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/** Returns the rule specificity score, or null if the rule does not apply. */
export function ruleSpecificity(rule: FeeRule, sale: SaleContext): number | null {
  if (!rule.active) return null;
  if (rule.validFrom > sale.occurredAt) return null;
  if (rule.validUntil && rule.validUntil <= sale.occurredAt) return null;

  let score = 0;
  if (rule.provider !== null) {
    if (!same(rule.provider, sale.provider)) return null;
    score += 1;
  }
  if (rule.productId !== null) {
    if (!same(rule.productId, sale.productId)) return null;
    score += 8;
  }
  if (rule.paymentMethod !== null) {
    if (!same(rule.paymentMethod, sale.paymentMethod)) return null;
    score += 4;
  }
  if (rule.installmentMin !== null || rule.installmentMax !== null) {
    const n = sale.installments ?? 1;
    if (rule.installmentMin !== null && n < rule.installmentMin) return null;
    if (rule.installmentMax !== null && n > rule.installmentMax) return null;
    score += 2;
  }
  return score;
}

/**
 * specific rule > provider rule > organization default.
 * Ties: most recent validFrom wins, then id for determinism.
 */
export function resolveFeeRule(rules: FeeRule[], sale: SaleContext): FeeRule | null {
  let best: { rule: FeeRule; score: number } | null = null;
  for (const rule of rules) {
    const score = ruleSpecificity(rule, sale);
    if (score === null) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (rule.validFrom > best.rule.validFrom ||
          (rule.validFrom.getTime() === best.rule.validFrom.getTime() && rule.id > best.rule.id)))
    ) {
      best = { rule, score };
    }
  }
  return best?.rule ?? null;
}

/** percent of an amount, rounded half away from zero to whole cents. */
export function percentOf(amount: Cents, percentage: number): Cents {
  return Math.round((amount * percentage) / 100);
}

export function calculateGatewayFee(
  gross: Cents,
  rule: Pick<FeeRule, "percentage" | "fixedAmount"> | null,
): Cents {
  if (!rule) return 0;
  return percentOf(gross, rule.percentage) + rule.fixedAmount;
}

// ------------------------------------------------------------ taxes and costs

/** Revenue tax (e.g. 6%) over gross sale value. */
export function calculateTaxes(gross: Cents, percentage: number): Cents {
  return percentOf(gross, percentage);
}

/** Meta Ads tax applies to ad spend, never to revenue. */
export function calculateMetaAdsTax(adSpend: Cents, percentage: number): Cents {
  return percentOf(adSpend, percentage);
}

export type ProductCostRule =
  | { kind: "fixed_per_unit"; amount: Cents }
  | { kind: "percent_of_sale"; percentage: number };

export function calculateProductCost(
  line: { quantity: number; unitAmount: Cents },
  rule: ProductCostRule | null,
): Cents {
  if (!rule) return 0;
  if (rule.kind === "fixed_per_unit") return rule.amount * line.quantity;
  return percentOf(line.quantity * line.unitAmount, rule.percentage);
}

// ------------------------------------------------------------------- snapshot

export type FinancialSnapshot = {
  feeRuleId: string | null;
  gatewayFeeAmount: Cents;
  taxAmount: Cents;
  productCostAmount: Cents;
  /** Inputs used, frozen so history never changes when rules change. */
  inputs: {
    gross: Cents;
    feePercentage: number | null;
    feeFixedAmount: Cents | null;
    taxPercentage: number | null;
    calculatedAt: string;
  };
};

export function buildFinancialSnapshot(args: {
  gross: Cents;
  feeRule: FeeRule | null;
  taxPercentage?: number | null;
  productCost?: Cents;
  now?: Date;
}): FinancialSnapshot {
  const { gross, feeRule, taxPercentage = null, productCost = 0, now = new Date() } = args;
  return {
    feeRuleId: feeRule?.id ?? null,
    gatewayFeeAmount: calculateGatewayFee(gross, feeRule),
    taxAmount: taxPercentage === null ? 0 : calculateTaxes(gross, taxPercentage),
    productCostAmount: productCost,
    inputs: {
      gross,
      feePercentage: feeRule?.percentage ?? null,
      feeFixedAmount: feeRule?.fixedAmount ?? null,
      taxPercentage,
      calculatedAt: now.toISOString(),
    },
  };
}

// -------------------------------------------------------------------- metrics

export type PeriodTotals = {
  /** Approved sales before deductions. Kept for audit even after refunds. */
  grossRevenue: Cents;
  refunds: Cents;
  chargebacks: Cents;
  gatewayFees: Cents;
  taxes: Cents;
  productCosts: Cents;
  adSpend: Cents;
  metaAdsTax: Cents;
  expenses: Cents;
};

/** Approved revenue − refunds − chargebacks. */
export function calculateCashRevenue(t: PeriodTotals): Cents {
  return t.grossRevenue - t.refunds - t.chargebacks;
}

/** Approved revenue − refunds − chargebacks − gateway fees − taxes. */
export function calculateNetRevenue(t: PeriodTotals): Cents {
  return calculateCashRevenue(t) - t.gatewayFees - t.taxes;
}

/** Everything that was spent to produce the revenue. */
export function calculateTotalCosts(t: PeriodTotals): Cents {
  return t.adSpend + t.metaAdsTax + t.gatewayFees + t.taxes + t.productCosts + t.expenses;
}

/** Net Revenue − Ad Spend − Meta tax − Product costs − Expenses. */
export function calculateProfit(t: PeriodTotals): Cents {
  return calculateNetRevenue(t) - t.adSpend - t.metaAdsTax - t.productCosts - t.expenses;
}

/** Profit / total costs. `null` when there are no costs (renders as "—"). */
export function calculateROI(t: PeriodTotals): number | null {
  const costs = calculateTotalCosts(t);
  return costs > 0 ? calculateProfit(t) / costs : null;
}

/** Revenue / ad spend. `null` when spend is zero (never Infinity). */
export function calculateROAS(revenue: Cents, adSpend: Cents): number | null {
  return adSpend > 0 ? revenue / adSpend : null;
}

/** Profit / net revenue. `null` when net revenue is not positive. */
export function calculateMargin(t: PeriodTotals): number | null {
  const net = calculateNetRevenue(t);
  return net > 0 ? calculateProfit(t) / net : null;
}

/** spend / purchases. `null` without purchases. */
export function calculateCPA(spend: Cents, purchases: number): Cents | null {
  return purchases > 0 ? Math.round(spend / purchases) : null;
}
