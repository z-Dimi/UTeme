"use client";

import { useMemo, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import {
  calculateGatewayFee,
  calculateProductCost,
  calculateTaxes,
  resolveFeeRule,
  type FeeRule,
} from "@/lib/finance";
import { formatCurrency, formatSignedCurrency } from "@/lib/formatting";
import { parseBRLToCents } from "@/lib/money";

export type SerializedRule = Omit<FeeRule, "validFrom" | "validUntil"> & {
  kind: string;
  validFrom: string;
  validUntil: string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/** Uses the very same pure functions the webhook pipeline uses, so what you simulate is what gets applied. */
export function FeeSimulator({ rules }: { rules: SerializedRule[] }) {
  const [amount, setAmount] = useState("197,00");
  const [provider, setProvider] = useState("cakto");
  const [method, setMethod] = useState("credit_card");
  const [installments, setInstallments] = useState("3");
  const [productId, setProductId] = useState("");

  const result = useMemo(() => {
    const gross = parseBRLToCents(amount);
    if (gross === null) return null;
    const revive = (kind: string) =>
      rules
        .filter((r) => r.kind === kind)
        .map((r) => ({ ...r, validFrom: new Date(r.validFrom), validUntil: r.validUntil ? new Date(r.validUntil) : null }));
    const sale = {
      provider,
      paymentMethod: method,
      installments: Number(installments) || 1,
      productId: productId || null,
      occurredAt: new Date(),
    };
    const feeRule = resolveFeeRule(revive("gateway_fee"), sale);
    const taxRule = resolveFeeRule(revive("tax"), sale);
    const costRule = resolveFeeRule(revive("product_cost"), sale);

    const fee = calculateGatewayFee(gross, feeRule);
    const tax = taxRule ? calculateTaxes(gross, taxRule.percentage) : 0;
    const cost = costRule
      ? calculateProductCost(
          { quantity: 1, unitAmount: gross },
          costRule.fixedAmount > 0
            ? { kind: "fixed_per_unit", amount: costRule.fixedAmount }
            : { kind: "percent_of_sale", percentage: costRule.percentage },
        )
      : 0;
    return { gross, fee, tax, cost, net: gross - fee - tax - cost, feeRule, taxRule, costRule };
  }, [amount, provider, method, installments, productId, rules]);

  const line = (label: string, cents: number, hint?: string | null) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-muted">
        {label}
        {hint ? <span className="ml-1.5 text-[11px] text-muted/70">({hint})</span> : null}
      </span>
      <span className="tabular-nums">{formatSignedCurrency(-cents)}</span>
    </div>
  );

  return (
    <section aria-label="Simulador" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-[13px] font-semibold">Simulador</h2>
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="Venda (R$)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Plataforma">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className={selectClass}>
            <option value="cakto">Cakto</option>
            <option value="custom">Webhook personalizado</option>
          </select>
        </Field>
        <Field label="Pagamento">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
            <option value="pix">Pix</option>
            <option value="credit_card">Cartão de crédito</option>
            <option value="boleto">Boleto</option>
            <option value="debit_card">Cartão de débito</option>
          </select>
        </Field>
        <Field label="Parcelas">
          <Input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="ID do produto">
          <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="opcional" />
        </Field>
      </div>

      {result ? (
        <div className="max-w-md divide-y divide-border rounded-lg border border-border bg-surface px-3 text-[13px]">
          <div className="flex items-baseline justify-between py-1.5">
            <span className="text-muted">Bruto</span>
            <span className="tabular-nums">{formatCurrency(result.gross)}</span>
          </div>
          {line("Gateway", result.fee, result.feeRule?.id ? "regra aplicada" : "sem regra")}
          {line("Imposto", result.tax, result.taxRule ? null : "sem regra")}
          {line("Custo do produto", result.cost, result.costRule ? null : "sem regra")}
          <div className="flex items-baseline justify-between py-2 font-medium">
            <span>Líquido</span>
            <span className="tabular-nums">{formatCurrency(result.net)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-danger">Valor inválido.</p>
      )}
    </section>
  );
}
