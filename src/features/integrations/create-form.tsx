"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createIntegration, type CreateIntegrationState } from "./actions";

export function CreateIntegrationForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState<CreateIntegrationState, FormData>(createIntegration, {});
  const [provider, setProvider] = useState<"cakto" | "custom">("cakto");

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-[13px] font-semibold">Nova integração de vendas</h2>

      <form action={action} className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto] md:items-end" noValidate>
        <Field label="Plataforma">
          <select
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "cakto" | "custom")}
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] hover:border-border-hover"
          >
            <option value="cakto">Cakto</option>
            <option value="custom">Webhook personalizado</option>
          </select>
        </Field>
        <Field label="Nome" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Ex.: Cakto — Produto X" required />
        </Field>
        {provider === "cakto" ? (
          <Field label="Secret do webhook (Cakto)" error={state.fieldErrors?.secret}>
            <Input name="secret" type="password" autoComplete="off" placeholder="Cole o secret gerado pela Cakto" />
          </Field>
        ) : (
          <p className="pb-2 text-xs text-muted">Geramos um secret para você ao criar.</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Criar
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      {state.created ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
          <p className="font-medium text-success">Integração criada.</p>
          <p className="text-muted">URL do webhook (cadastre na {state.created.provider === "cakto" ? "Cakto" : "sua plataforma"}):</p>
          <code className="block break-all rounded bg-card px-2 py-1.5 text-foreground">
            {appUrl}/api/webhooks/{state.created.provider}/{state.created.id}
          </code>
          {state.created.secret ? (
            <>
              <p className="text-warning">Guarde este secret agora. Ele não será exibido novamente.</p>
              <code className="block break-all rounded bg-card px-2 py-1.5 text-foreground">{state.created.secret}</code>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
