import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { reprocessEvent } from "@/features/events/actions";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Evento" };

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("webhook_events")
    .select("*")
    .eq("id", id)
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();
  if (!event) notFound();

  const { data: history } = await supabase
    .from("order_events")
    .select("id, event_type, from_status, to_status, result, occurred_at, orders(external_order_id)")
    .eq("webhook_event_id", id)
    .order("created_at");

  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: workspace.activeProject.timezone }).format(new Date(iso)) : "—";
  const canReprocess = event.status === "failed" && ["owner", "admin"].includes(workspace.activeOrganization.role);

  const facts: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={event.status} />],
    ["Origem", event.provider],
    ["Tipo", event.event_type ?? "—"],
    ["Pedido", event.external_order_id ?? "—"],
    ["Recebido", fmt(event.received_at)],
    ["Processado", fmt(event.processed_at)],
    ["Tentativas", String(event.attempt_count)],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/events" className="text-xs text-info hover:underline">
        ← Eventos
      </Link>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 break-all text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
        {event.error_message ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            {event.error_message}
          </p>
        ) : null}
        {canReprocess ? (
          <form action={reprocessEvent}>
            <input type="hidden" name="id" value={event.id} />
            <Button type="submit" variant="secondary" size="sm">
              Reprocessar
            </Button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Resultado no pedido</h3>
        {history && history.length > 0 ? (
          <ul className="space-y-1.5 text-xs">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-3 text-muted">
                <span className="font-mono text-foreground">{h.event_type}</span>
                <span>
                  {h.from_status ?? "novo"} → {h.to_status}
                </span>
                <span>{h.result === "applied" ? "aplicado" : h.result === "noop" ? "sem alteração" : "bloqueado (regressão)"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Este evento não alterou nenhum pedido.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Payload (sem credenciais)</h3>
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-surface p-3 text-[11px] leading-relaxed text-muted">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
        <h3 className="mb-2 mt-4 text-[13px] font-semibold">Headers</h3>
        <pre className="overflow-auto rounded-lg bg-surface p-3 text-[11px] text-muted">{JSON.stringify(event.headers, null, 2)}</pre>
      </section>
    </div>
  );
}
