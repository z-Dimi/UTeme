import { describe, expect, it } from "vitest";
import {
  buildFinancialSnapshot,
  calculateCPA,
  calculateGatewayFee,
  calculateMargin,
  calculateMetaAdsTax,
  calculateNetRevenue,
  calculateProductCost,
  calculateProfit,
  calculateROAS,
  calculateROI,
  calculateTaxes,
  resolveFeeRule,
  type FeeRule,
  type PeriodTotals,
} from "./index";
import { resolveTransition } from "./order-state";
import { formatSignedNumber, getMetricColor, getMetricSemantic } from "../formatting";

const rule = (over: Partial<FeeRule> = {}): FeeRule => ({
  id: "r1",
  provider: null,
  productId: null,
  paymentMethod: null,
  installmentMin: null,
  installmentMax: null,
  percentage: 0,
  fixedAmount: 0,
  validFrom: new Date("2026-01-01T00:00:00Z"),
  validUntil: null,
  active: true,
  ...over,
});

const totals = (over: Partial<PeriodTotals> = {}): PeriodTotals => ({
  grossRevenue: 0,
  refunds: 0,
  chargebacks: 0,
  gatewayFees: 0,
  taxes: 0,
  productCosts: 0,
  adSpend: 0,
  metaAdsTax: 0,
  expenses: 0,
  ...over,
});

describe("gateway fees", () => {
  it("percentage only", () => {
    expect(calculateGatewayFee(10000, rule({ percentage: 4.99 }))).toBe(499);
  });
  it("fixed only", () => {
    expect(calculateGatewayFee(10000, rule({ fixedAmount: 100 }))).toBe(100);
  });
  it("percentage + fixed (spec example: 4,99% + R$1 on R$100 = R$5,99)", () => {
    expect(calculateGatewayFee(10000, rule({ percentage: 4.99, fixedAmount: 100 }))).toBe(599);
  });
  it("no rule means zero fee", () => {
    expect(calculateGatewayFee(10000, null)).toBe(0);
  });
});

describe("fee rule resolution", () => {
  const at = new Date("2026-06-01T12:00:00Z");
  const sale = { provider: "krowk", paymentMethod: "pix", installments: 1, occurredAt: at };

  it("provider+payment rule beats provider default beats org default", () => {
    const orgDefault = rule({ id: "org", percentage: 6 });
    const providerDefault = rule({ id: "prov", provider: "krowk", percentage: 5 });
    const pix = rule({ id: "pix", provider: "krowk", paymentMethod: "pix", percentage: 4.99 });
    expect(resolveFeeRule([orgDefault, providerDefault, pix], sale)?.id).toBe("pix");
    expect(resolveFeeRule([orgDefault, providerDefault], sale)?.id).toBe("prov");
    expect(resolveFeeRule([orgDefault], sale)?.id).toBe("org");
  });

  it("selects the installment bracket", () => {
    const rules = [
      rule({ id: "1x", provider: "krowk", paymentMethod: "card", installmentMin: 1, installmentMax: 1, percentage: 5.99 }),
      rule({ id: "2-3x", provider: "krowk", paymentMethod: "card", installmentMin: 2, installmentMax: 3, percentage: 6.99 }),
    ];
    const card = { provider: "krowk", paymentMethod: "card", occurredAt: at };
    expect(resolveFeeRule(rules, { ...card, installments: 1 })?.id).toBe("1x");
    expect(resolveFeeRule(rules, { ...card, installments: 3 })?.id).toBe("2-3x");
    expect(resolveFeeRule(rules, { ...card, installments: 6 })).toBeNull();
  });

  it("respects validity: an old sale keeps the old rate", () => {
    const old = rule({ id: "old", percentage: 4.99, validUntil: new Date("2026-05-01T00:00:00Z") });
    const next = rule({ id: "new", percentage: 5.49, validFrom: new Date("2026-05-01T00:00:00Z") });
    const march = { provider: "krowk", occurredAt: new Date("2026-03-10T00:00:00Z") };
    const june = { provider: "krowk", occurredAt: new Date("2026-06-10T00:00:00Z") };
    expect(resolveFeeRule([old, next], march)?.id).toBe("old");
    expect(resolveFeeRule([old, next], june)?.id).toBe("new");
  });

  it("ignores inactive rules", () => {
    expect(resolveFeeRule([rule({ active: false })], sale)).toBeNull();
  });
});

describe("taxes and product cost", () => {
  it("revenue tax", () => expect(calculateTaxes(19700, 6)).toBe(1182));
  it("meta ads tax applies to spend", () => expect(calculateMetaAdsTax(100000, 12.15)).toBe(12150));
  it("fixed cost per unit x quantity", () => {
    expect(calculateProductCost({ quantity: 2, unitAmount: 9000 }, { kind: "fixed_per_unit", amount: 3500 })).toBe(7000);
  });
  it("percent of sale", () => {
    expect(calculateProductCost({ quantity: 1, unitAmount: 10000 }, { kind: "percent_of_sale", percentage: 10 })).toBe(1000);
  });
});

describe("snapshot freezes calculation inputs", () => {
  it("stores rule id, amounts and the rate used", () => {
    const r = rule({ id: "pix", percentage: 4.99, fixedAmount: 100 });
    const s = buildFinancialSnapshot({ gross: 10000, feeRule: r, taxPercentage: 6, now: new Date("2026-06-01T00:00:00Z") });
    expect(s).toMatchObject({ feeRuleId: "pix", gatewayFeeAmount: 599, taxAmount: 600 });
    expect(s.inputs.feePercentage).toBe(4.99);
  });
});

describe("period metrics", () => {
  it("net revenue, profit, ROI, margin on a profitable period", () => {
    const t = totals({ grossRevenue: 10000, gatewayFees: 500, taxes: 500, adSpend: 5000, productCosts: 1000 });
    expect(calculateNetRevenue(t)).toBe(9000);
    expect(calculateProfit(t)).toBe(3000);
    expect(calculateROI(t)).toBeCloseTo(3000 / 7000);
    expect(calculateMargin(t)).toBeCloseTo(3000 / 9000);
  });

  it("spec example: revenue 100, costs 80 -> profit 20, ROI +0,25 green", () => {
    const t = totals({ grossRevenue: 10000, adSpend: 8000 });
    expect(calculateProfit(t)).toBe(2000);
    const roi = calculateROI(t);
    expect(roi).toBeCloseTo(0.25);
    expect(formatSignedNumber(roi)).toBe("+0,25");
    expect(getMetricColor(getMetricSemantic(roi))).toBe("text-success");
  });

  it("spec example: revenue 100, costs 120 -> profit -20, ROI -0,17 red", () => {
    const t = totals({ grossRevenue: 10000, adSpend: 12000 });
    expect(calculateProfit(t)).toBe(-2000);
    const roi = calculateROI(t);
    expect(roi).toBeCloseTo(-0.1667, 4);
    expect(formatSignedNumber(roi)).toBe("-0,17");
    expect(getMetricColor(getMetricSemantic(roi))).toBe("text-danger");
  });

  it("zero profit is neutral", () => {
    const t = totals({ grossRevenue: 10000, adSpend: 10000 });
    expect(calculateProfit(t)).toBe(0);
    expect(getMetricSemantic(calculateROI(t))).toBe("neutral");
  });

  it("refund lowers net revenue, profit, ROI and margin; gross stays for audit", () => {
    const before = totals({ grossRevenue: 10000, adSpend: 4000 });
    const after = totals({ grossRevenue: 10000, adSpend: 4000, refunds: 10000 });
    expect(after.grossRevenue).toBe(before.grossRevenue);
    expect(calculateNetRevenue(after)).toBe(0);
    expect(calculateProfit(after)).toBe(-4000);
    expect(calculateROI(after)).toBe(-1);
    expect(calculateROI(after)!).toBeLessThan(calculateROI(before)!);
    expect(calculateMargin(after)).toBeNull();
  });

  it("chargeback behaves like refund", () => {
    const t = totals({ grossRevenue: 10000, chargebacks: 10000, adSpend: 1000 });
    expect(calculateNetRevenue(t)).toBe(0);
    expect(calculateProfit(t)).toBe(-1000);
  });

  it("expenses affect profit/ROI but not ROAS", () => {
    const base = totals({ grossRevenue: 10000, adSpend: 2000 });
    const withExpense = { ...base, expenses: 1000 };
    expect(calculateProfit(withExpense)).toBe(calculateProfit(base) - 1000);
    expect(calculateROAS(10000, 2000)).toBe(5);
  });

  it("meta ads tax lowers profit and does not touch revenue", () => {
    const t = totals({ grossRevenue: 10000, adSpend: 1000, metaAdsTax: 122 });
    expect(calculateNetRevenue(t)).toBe(10000);
    expect(calculateProfit(t)).toBe(10000 - 1000 - 122);
  });

  it("zero division yields null, never Infinity", () => {
    expect(calculateROAS(10000, 0)).toBeNull();
    expect(calculateROI(totals({ grossRevenue: 10000 }))).toBeNull();
    expect(calculateCPA(1000, 0)).toBeNull();
  });

  it("CPA", () => expect(calculateCPA(10000, 40)).toBe(250));
});

describe("order status machine", () => {
  it("allows forward transitions", () => {
    expect(resolveTransition("pending", "approved")).toEqual({ kind: "apply", to: "approved" });
    expect(resolveTransition("approved", "refunded")).toEqual({ kind: "apply", to: "refunded" });
    expect(resolveTransition("approved", "chargeback")).toEqual({ kind: "apply", to: "chargeback" });
  });
  it("rejects a late webhook that would regress status", () => {
    expect(resolveTransition("refunded", "pending").kind).toBe("reject");
    expect(resolveTransition("refunded", "approved").kind).toBe("reject");
    expect(resolveTransition("approved", "pending").kind).toBe("reject");
    expect(resolveTransition("chargeback", "approved").kind).toBe("reject");
  });
  it("treats same status as an idempotent no-op", () => {
    expect(resolveTransition("approved", "approved").kind).toBe("noop");
  });
});
