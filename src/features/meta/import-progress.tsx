"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

type Status = {
  status: string;
  backfill_status?: string;
  backfill_progress?: {
    step?: string;
    campaigns?: number;
    adsets?: number;
    ads?: number;
    windows_done?: number;
    windows_total?: number;
    days?: number;
  };
  last_error?: string | null;
};

const POLL_MS = 2500;

/** Polls the import status and refreshes the page when it finishes. Numbers come from Meta, never invented. */
export function ImportProgress({ initial }: { initial: Status }) {
  const router = useRouter();
  const [state, setState] = useState<Status>(initial);

  useEffect(() => {
    if (state.backfill_status === "done" || state.backfill_status === "failed") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/meta/status", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Status;
        setState(next);
        if (next.backfill_status === "done" || next.backfill_status === "failed") router.refresh();
      } catch {
        // transient network error: keep polling
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state.backfill_status, router]);

  const p = state.backfill_progress ?? {};
  const insights = p.step === "insights" || p.step === "done";
  const done = state.backfill_status === "done";
  const failed = state.backfill_status === "failed";

  const row = (ok: boolean, active: boolean, text: string) => (
    <li className="flex items-center gap-2">
      {ok ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-info" aria-hidden /> : <span className="h-3.5 w-3.5" />}
      <span className={ok ? "text-foreground" : "text-muted"}>{text}</span>
    </li>
  );

  return (
    <section role="status" aria-live="polite" className="space-y-3 rounded-xl border border-border bg-card p-4 text-[13px]">
      <h3 className="font-semibold">{done ? "Últimos 30 dias importados" : failed ? "Falha ao importar" : "Importando seus últimos 30 dias…"}</h3>
      <ul className="space-y-1.5">
        {row(true, false, "Conectado à Meta")}
        {row(insights, p.step === "structure", insights ? `Campanhas: ${p.campaigns ?? 0} · Conjuntos: ${p.adsets ?? 0} · Anúncios: ${p.ads ?? 0}` : "Buscando campanhas, conjuntos e anúncios")}
        {row(
          done,
          p.step === "insights",
          done ? "Últimos 30 dias importados" : `Importando métricas diárias (${p.windows_done ?? 0}/${p.windows_total ?? 5} blocos)`,
        )}
      </ul>
      {failed ? (
        <p role="alert" className="text-xs text-danger">
          {state.last_error ?? "Não foi possível concluir."} Selecione a conta novamente para tentar de novo.
        </p>
      ) : null}
    </section>
  );
}
