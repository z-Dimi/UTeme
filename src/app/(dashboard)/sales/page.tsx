import Link from "next/link";
import { formatCurrency } from "@/lib/formatting";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Vendas" };

const PAGE_SIZE = 25;

const STATUS: Record<string, { label: string; className: string }> = {
  approved: { label: "Aprovada", className: "bg-success/10 text-success" },
  pending: { label: "Pendente", className: "bg-warning/10 text-warning" },
  refunded: { label: "Reembolsada", className: "bg-danger/10 text-danger" },
  chargeback: { label: "Chargeback", className: "bg-danger/10 text-danger" },
  cancelled: { label: "Cancelada", className: "bg-surface text-muted" },
  failed: { label: "Falhou", className: "bg-surface text-muted" },
};

type OrderRow = {
  id: string;
  external_order_id: string;
  provider: string;
  status: string;
  payment_method: string | null;
  currency: string;
  gross_amount: number;
  gateway_fee_amount: number;
  net_amount: number;
  ordered_at: string;
  customers: { name: string | null; email: string } | null;
  order_items: { name: string }[];
};

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("orders")
    .select(
      "id, external_order_id, provider, status, payment_method, currency, gross_amount, gateway_fee_amount, net_amount, ordered_at, customers(name, email), order_items(name)",
      { count: "exact" },
    )
    .eq("project_id", workspace.activeProject.id)
    .order("ordered_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .overrideTypes<OrderRow[], { merge: false }>();

  const orders = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const tz = workspace.activeProject.timezone;
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(new Date(iso));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Vendas</h2>
        <p className="text-muted">Pedidos recebidos das plataformas conectadas. Horários em {tz}.</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-danger">
          Não foi possível carregar as vendas.
        </p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">
          Nenhuma venda recebida ainda.{" "}
          <Link href="/integrations" className="text-info hover:underline">
            Conecte uma plataforma
          </Link>{" "}
          para começar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                {["Data", "Pedido", "Cliente", "Produto", "Pagamento", "Bruto", "Taxas", "Líquido", "Status"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const s = STATUS[o.status] ?? { label: o.status, className: "bg-surface text-muted" };
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-card-hover">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(o.ordered_at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link href={`/sales/${o.id}`} className="text-info hover:underline">
                        {o.external_order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5">{o.customers?.name ?? o.customers?.email ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5">{o.order_items[0]?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{o.payment_method ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(o.gross_amount, o.currency)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{formatCurrency(o.gateway_fee_amount, o.currency)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(o.net_amount, o.currency)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.className}`}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
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
            {page > 1 ? (
              <Link href={`/sales?page=${page - 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">
                Anterior
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={`/sales?page=${page + 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-border-hover">
                Próxima
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
