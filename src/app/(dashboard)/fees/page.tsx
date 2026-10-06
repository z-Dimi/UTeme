import { Button } from "@/components/ui/button";
import { endFeeRule } from "@/features/fees/actions";
import { FeeForm, KIND_LABEL } from "@/features/fees/fee-form";
import { FeeSimulator, type SerializedRule } from "@/features/fees/simulator";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Taxas" };

type Row = {
  id: string;
  kind: string;
  name: string;
  provider: string | null;
  external_product_id: string | null;
  payment_method: string | null;
  installment_min: number | null;
  installment_max: number | null;
  percentage: number | string;
  fixed_amount: number;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
};

/** Server component: evaluated per request, kept outside render for the purity lint. */
const currentTime = () => Date.now();

function status(r: Row, now: number) {
  if (!r.active) return { label: "Inativa", cls: "bg-surface text-muted" };
  if (new Date(r.valid_from).getTime() > now) return { label: "Agendada", cls: "bg-info/10 text-info" };
  if (r.valid_until && new Date(r.valid_until).getTime() <= now) return { label: "Encerrada", cls: "bg-surface text-muted" };
  return { label: "Vigente", cls: "bg-success/10 text-success" };
}

export default async function FeesPage() {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_rules")
    .select(
      "id, kind, name, provider, external_product_id, payment_method, installment_min, installment_max, percentage, fixed_amount, valid_from, valid_until, active",
    )
    .eq("project_id", workspace.activeProject.id)
    .order("kind")
    .order("valid_from", { ascending: false })
    .overrideTypes<Row[], { merge: false }>();

  const rows = data ?? [];
  const now = currentTime();
  const canManage = ["owner", "admin"].includes(workspace.activeOrganization.role);
  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: workspace.activeProject.timezone }).format(new Date(iso)) : "—";

  const simulatorRules: SerializedRule[] = rows
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      provider: r.provider,
      productId: r.external_product_id,
      paymentMethod: r.payment_method,
      installmentMin: r.installment_min,
      installmentMax: r.installment_max,
      percentage: Number(r.percentage),
      fixedAmount: r.fixed_amount,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      active: r.active,
    }));

  const counts = Object.keys(KIND_LABEL).map((kind) => ({
    kind,
    n: rows.filter((r) => r.kind === kind && status(r, now).label === "Vigente").length,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Taxas</h2>
        <p className="text-muted">
          Regras aplicadas automaticamente a cada venda recebida. O cálculo é congelado no pedido: mudar uma taxa
          não altera vendas anteriores.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {counts.map((c) => (
          <div key={c.kind} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted">{KIND_LABEL[c.kind]}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(c.n)}</p>
            <p className="text-[11px] text-muted">regras vigentes</p>
          </div>
        ))}
      </div>

      {canManage ? <FeeForm /> : null}
      <FeeSimulator rules={simulatorRules} />

      <section aria-label="Regras" className="overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">Nenhuma regra cadastrada. Sem regra, o gateway e os impostos entram como R$ 0,00.</p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                {["Nome", "Tipo", "Plataforma", "Pagamento", "Parcelas", "Percentual", "Fixo", "Vigência", "Status", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = status(r, now);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-card-hover">
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-muted">{KIND_LABEL[r.kind]}</td>
                    <td className="px-3 py-2.5 text-muted">{r.provider ?? "Todas"}</td>
                    <td className="px-3 py-2.5 text-muted">{r.payment_method ?? "Todas"}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {r.installment_min || r.installment_max ? `${r.installment_min ?? 1}–${r.installment_max ?? "∞"}x` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNumber(Number(r.percentage), 2)}%</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(r.fixed_amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {fmtDate(r.valid_from)} → {fmtDate(r.valid_until)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canManage && !r.valid_until ? (
                        <form action={endFeeRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Encerrar
                          </Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
