"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { updateProject, type SettingsState } from "./actions";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "UTC",
];

export function ProjectForm({
  name,
  timezone,
  goal,
  canEdit,
}: {
  name: string;
  timezone: string;
  /** Revenue goal formatted for the input, e.g. "1.000.000,00". */
  goal: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateProject, {});
  const zones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome do projeto" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={name} disabled={!canEdit} required />
        </Field>
        <Field label="Fuso horário" error={state.fieldErrors?.timezone}>
          <select
            name="timezone"
            defaultValue={timezone}
            disabled={!canEdit}
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] hover:border-border-hover disabled:opacity-50"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Meta de faturamento bruto (R$)" error={state.fieldErrors?.goal}>
          <Input name="goal" defaultValue={goal} inputMode="decimal" disabled={!canEdit} required />
        </Field>
      </div>
      <p className="text-xs text-muted">
        A meta aparece no menu lateral e conta o faturamento bruto acumulado de todas as vendas aprovadas. O fuso define o que é “hoje” e “ontem” nos filtros e os horários exibidos. Os timestamps continuam guardados em UTC.
      </p>
      {state.error ? <p role="alert" className="text-xs text-danger">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-xs text-success">Salvo.</p> : null}
      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Salvar
        </Button>
      ) : null}
    </form>
  );
}
