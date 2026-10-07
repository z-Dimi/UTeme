"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { connectWithToken } from "./actions";

export function TokenForm() {
  const [state, action, pending] = useActionState(connectWithToken, {});
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-[13px] font-medium">Conectar com token de Usuário do Sistema</summary>
      <div className="mt-3 space-y-3 text-xs text-muted">
        <ol className="list-decimal space-y-1 pl-5">
          <li>No Gerenciador de Negócios: Configurações do negócio → Usuários → Usuários do sistema → Adicionar.</li>
          <li>Atribua a conta de anúncios ao usuário (acesso de leitura é suficiente).</li>
          <li>Clique em Gerar token, escolha o app e marque a permissão <span className="font-mono text-foreground">ads_read</span>.</li>
          <li>Cole o token abaixo. Ele é validado na Meta e guardado criptografado; não é exibido de novo.</li>
        </ol>
        <form action={action} className="space-y-3" noValidate>
          <Field label="Token de acesso">
            <Input name="token" type="password" autoComplete="off" spellCheck={false} placeholder="EAAB…" required />
          </Field>
          {state.error ? (
            <p role="alert" className="text-danger">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Validar e conectar
          </Button>
        </form>
      </div>
    </details>
  );
}
