"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createExpense, type ExpenseFormState } from "./actions";

export const CATEGORY_LABEL: Record<string, string> = {
  creative: "Criativo",
  influencer: "Influenciador",
  software: "Software",
  staff: "Funcionário",
  freelancer: "Freelancer",
  other: "Outros",
};

export function ExpenseForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(createExpense, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-card p-4" noValidate>
      <h2 className="text-[13px] font-semibold">Nova despesa</h2>
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="Nome" error={e.name}>
          <Input name="name" placeholder="Ex.: Edição de criativos" required />
        </Field>
        <Field label="Categoria">
          <select name="category" className="h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] hover:border-border-hover">
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor (R$)" error={e.amount}>
          <Input name="amount" inputMode="decimal" placeholder="350,00" required />
        </Field>
        <Field label="Data" error={e.incurred_on}>
          <Input name="incurred_on" type="date" defaultValue={today} required className="scheme-dark" />
        </Field>
        <Field label="Observação">
          <Input name="note" maxLength={500} />
        </Field>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-xs text-success">
          Despesa registrada. O lucro e o ROI do período já refletem este valor.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Adicionar
      </Button>
    </form>
  );
}
