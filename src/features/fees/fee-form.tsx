"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createFeeRule, type FeeFormState } from "./actions";

export const KIND_LABEL: Record<string, string> = {
  gateway_fee: "Taxa do gateway",
  tax: "Imposto sobre receita",
  product_cost: "Custo de produto",
  meta_ads_tax: "Imposto Meta Ads",
};

const selectClass =
  "h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function FeeForm() {
  const [state, action, pending] = useActionState<FeeFormState, FormData>(createFeeRule, {});
  const [kind, setKind] = useState("gateway_fee");
  const e = state.fieldErrors ?? {};
  const saleRule = kind === "gateway_fee" || kind === "tax" || kind === "product_cost";

  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-card p-4" noValidate>
      <h2 className="text-[13px] font-semibold">Nova regra</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Tipo">
          <select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value)} className={selectClass}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome" error={e.name}>
          <Input name="name" placeholder="Ex.: Cakto — Pix" required />
        </Field>
        {saleRule ? (
          <>
            <Field label="Plataforma">
              <select name="provider" className={selectClass} defaultValue="">
                <option value="">Qualquer</option>
                <option value="cakto">Cakto</option>
                <option value="custom">Webhook personalizado</option>
              </select>
            </Field>
            <Field label="Forma de pagamento">
              <select name="payment_method" className={selectClass} defaultValue="">
                <option value="">Qualquer</option>
                <option value="pix">Pix</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="boleto">Boleto</option>
                <option value="debit_card">Cartão de débito</option>
                <option value="picpay">PicPay</option>
              </select>
            </Field>
            <Field label="ID externo do produto (opcional)">
              <Input name="external_product_id" placeholder="Vazio = todos" />
            </Field>
            <Field label="Parcelas de" error={e.installment_min}>
              <Input name="installment_min" inputMode="numeric" placeholder="1" />
            </Field>
            <Field label="Parcelas até" error={e.installment_max}>
              <Input name="installment_max" inputMode="numeric" placeholder="12" />
            </Field>
          </>
        ) : null}
        <Field label="Percentual (%)" error={e.percentage}>
          <Input name="percentage" inputMode="decimal" placeholder="4,99" />
        </Field>
        <Field label={kind === "product_cost" ? "Valor fixo por unidade (R$)" : "Valor fixo (R$)"} error={e.fixed}>
          <Input name="fixed" inputMode="decimal" placeholder="1,00" />
        </Field>
        <Field label="Válida a partir de" error={e.valid_from}>
          <Input name="valid_from" type="date" />
        </Field>
        <Field label="Válida até (opcional)" error={e.valid_until}>
          <Input name="valid_until" type="date" />
        </Field>
      </div>
      {kind === "product_cost" ? (
        <p className="text-xs text-muted">Com valor fixo preenchido, o custo é por unidade; senão, usa o percentual da venda.</p>
      ) : null}
      {kind === "meta_ads_tax" ? (
        <p className="text-xs text-muted">Aplicado sobre o investimento em anúncios, não sobre o faturamento.</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-xs text-success">
          Regra criada. Vale apenas para novas vendas; vendas anteriores não são alteradas.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Salvar regra
      </Button>
    </form>
  );
}
