import { formatNumber, formatPercent } from "@/lib/formatting";

export type SourceSale = { source: string; orders: number };

/** "n/a" is how the database groups sales that came without a source. Everything else is shown as reported. */
function label(source: string) {
  return source === "n/a" ? "N/A" : source;
}

/**
 * Sales by source, from the utm_source the gateway reported for each approved sale. We never guess a source:
 * a sale without one is listed as N/A.
 */
export function SourcesCard({ sources }: { sources: SourceSale[] }) {
  const total = sources.reduce((sum, s) => sum + s.orders, 0);
  return (
    <section aria-label="Vendas por Fonte" className="flex flex-col rounded-xl border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold">Vendas por Fonte</h3>
      {sources.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs text-muted">Nenhuma venda aprovada no período.</p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {sources.map((s) => {
            const share = total > 0 ? s.orders / total : 0;
            return (
              <li key={s.source} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate" title={label(s.source)}>
                    {label(s.source)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{formatNumber(s.orders)}</span>
                    <span className="ml-2 text-[11px] text-muted">{formatPercent(share, 0)}</span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface" aria-hidden>
                  <div className="h-full rounded-full bg-chart-3" style={{ width: `${Math.max(share * 100, 2)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
