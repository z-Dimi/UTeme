import { Download } from "lucide-react";
import { PRESET_LABEL, type Preset } from "@/lib/dates";

export const metadata = { title: "Relatórios" };

const PERIODS: Preset[] = ["today", "yesterday", "last_7", "last_30", "this_month", "last_month"];

const REPORTS = [
  { kind: "sales", title: "Vendas", desc: "Pedidos do período com valores brutos, taxas, impostos, reembolsos e líquido." },
  { kind: "expenses", title: "Despesas", desc: "Despesas manuais registradas no período." },
] as const;

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Relatórios</h2>
        <p className="text-muted">
          Exportações em CSV (UTF-8, valores em decimal com ponto). PDF e XLSX ainda não estão disponíveis.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {REPORTS.map((r) => (
          <section key={r.kind} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div>
              <h3 className="text-[13px] font-semibold">{r.title}</h3>
              <p className="mt-0.5 text-xs text-muted">{r.desc}</p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <li key={p}>
                  <a
                    href={`/api/export/${r.kind}?period=${p}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-border-hover hover:text-foreground"
                  >
                    <Download className="h-3 w-3" aria-hidden />
                    {PRESET_LABEL[p]}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
