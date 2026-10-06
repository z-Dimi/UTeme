import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatCurrency, formatSignedCurrency } from "@/lib/formatting";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Venda" };

const STATUS_LABEL: Record<string, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  cancelled: "Cancelada",
  failed: "Falhou",
};
const RESULT_LABEL: Record<string, string> = { applied: "aplicado", noop: "sem alteração", rejected: "bloqueado (regressão)" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*, customers(name, email, phone), order_items(name, quantity, unit_amount)")
    .eq("id", id)
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();
  if (!order) notFound();

  const { data: history } = await supabase
    .from("order_events")
    .select("id, event_type, from_status, to_status, result, occurred_at, webhook_event_id")
    .eq("order_id", id)
    .order("occurred_at");

  const tz = workspace.activeProject.timezone;
  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: tz }).format(new Date(iso)) : "—";
  const cur = order.currency as string;
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  const items = (order.order_items ?? []) as { name: string; quantity: number; unit_amount: number }[];
  const tracking = Object.entries((order.tracking ?? {}) as Record<string, string>);

  const money: [string, number, boolean][] = [
    ["Valor bruto", order.gross_amount, false],
    ["Desconto informado", order.discount_amount, false],
    ["Taxa do gateway", -order.gateway_fee_amount, true],
    ["Imposto", -order.tax_amount, true],
    ["Reembolso", -order.refund_amount, true],
    ["Chargeback", -order.chargeback_amount, true],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/sales" className="text-xs text-info hover:underline">
        ← Vendas
      </Link>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <dl className="space-y-2.5 text-[13px]">
          {(
            [
              ["Pedido", order.external_order_id],
              ["Status", STATUS_LABEL[order.status] ?? order.status],
              ["Plataforma", order.provider],
              ["Pagamento", `${order.payment_method ?? "—"}${order.installments ? ` · ${order.installments}x` : ""}`],
              ["Criado", fmt(order.ordered_at)],
              ["Aprovado", fmt(order.approved_at)],
              ["Reembolsado", fmt(order.refunded_at)],
              ["Chargeback", fmt(order.chargeback_at)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="break-all text-right">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface px-3 text-[13px]">
            {money.map(([label, cents, neg]) => (
              <div key={label} className="flex justify-between border-b border-border py-1.5 last:border-0">
                <span className="text-muted">{label}</span>
                <span className="tabular-nums">{neg ? formatSignedCurrency(cents, cur) : formatCurrency(cents, cur)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-medium">
              <span>Valor líquido</span>
              <span className="tabular-nums">{formatCurrency(order.net_amount, cur)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Custo de produto (fora do líquido): {formatCurrency(order.product_cost_amount, cur)}. Valores congelados no momento da aprovação.
            {order.fee_snapshot?.inputs
              ? ` Regra de taxa usada: ${order.fee_snapshot.inputs.feePercentage ?? 0}% + ${formatCurrency(order.fee_snapshot.inputs.feeFixedAmount ?? 0, cur)}.`
              : " Nenhuma regra de taxa estava vigente."}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 text-[13px]">
          <h3 className="mb-2 font-semibold">Cliente</h3>
          <p>{customer?.name ?? "—"}</p>
          <p className="text-muted">{customer?.email ?? "—"}</p>
          <p className="text-muted">{customer?.phone ?? ""}</p>
          <h3 className="mb-1 mt-4 font-semibold">Produtos</h3>
          <ul className="space-y-1">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span className="tabular-nums text-muted">{formatCurrency(it.unit_amount, cur)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 text-[13px]">
          <h3 className="mb-2 font-semibold">Rastreamento enviado pelo gateway</h3>
          {tracking.length === 0 ? (
            <p className="text-muted">Indisponível. Nenhuma atribuição é inferida sem identificador confiável.</p>
          ) : (
            <dl className="space-y-1 text-xs">
              {tracking.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Histórico</h3>
        {history && history.length > 0 ? (
          <ol className="space-y-1.5 text-xs">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-3 text-muted">
                <span className="whitespace-nowrap text-foreground">{fmt(h.occurred_at)}</span>
                <span className="font-mono">{h.event_type}</span>
                <span>
                  {h.from_status ?? "novo"} → {h.to_status}
                </span>
                <span>{RESULT_LABEL[h.result]}</span>
                {h.webhook_event_id ? (
                  <Link href={`/events/${h.webhook_event_id}`} className="text-info hover:underline">
                    webhook
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted">Sem eventos.</p>
        )}
      </section>
    </div>
  );
}
