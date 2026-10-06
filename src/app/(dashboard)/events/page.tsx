import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Eventos" };

const PAGE_SIZE = 25;
const FILTERS = [
  ["", "Todos"],
  ["processed", "Processados"],
  ["ignored", "Ignorados"],
  ["failed", "Com erro"],
] as const;

type Row = {
  id: string;
  provider: string;
  event_type: string | null;
  external_order_id: string | null;
  status: string;
  error_message: string | null;
  attempt_count: number;
  received_at: string;
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = FILTERS.some(([v]) => v === sp.status) ? (sp.status ?? "") : "";

  const workspace = await getWorkspace();
  const supabase = await createClient();
  let query = supabase
    .from("webhook_events")
    .select("id, provider, event_type, external_order_id, status, error_message, attempt_count, received_at", { count: "exact" })
    .eq("project_id", workspace.activeProject.id)
    .order("received_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.overrideTypes<Row[], { merge: false }>();

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: workspace.activeProject.timezone }).format(new Date(iso));
  const href = (p: number, st = status) => `/events?${new URLSearchParams({ ...(st ? { status: st } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Eventos</h2>
          <p className="text-muted">Todo webhook recebido é guardado antes de ser processado.</p>
        </div>
        <nav aria-label="Filtro de status" className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={href(1, value)}
              aria-current={status === value ? "true" : undefined}
              className={cn("rounded-md px-2.5 py-1 text-xs", status === value ? "bg-card text-foreground" : "text-muted hover:text-foreground")}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-danger">
          Não foi possível carregar os eventos.
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">Nenhum evento encontrado.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                {["Horário", "Tipo", "Origem", "Pedido", "Status", "Detalhe"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-card-hover">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmt(r.received_at)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.event_type ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{r.provider}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.external_order_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-muted">
                    <Link href={`/events/${r.id}`} className="text-info hover:underline">
                      Abrir
                    </Link>
                    {r.error_message ? <span className="ml-2" title={r.error_message}>{r.error_message}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-xs text-muted">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={href(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Anterior</Link> : null}
            {page < totalPages ? <Link href={href(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">Próxima</Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
