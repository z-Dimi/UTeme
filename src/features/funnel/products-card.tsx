import { formatNumber } from "@/lib/formatting";

export type ProductSale = { name: string; quantity: number };

/** Products sold in the period (approved and not refunded), quantity on the right. */
export function ProductsCard({ products }: { products: ProductSale[] }) {
  return (
    <section aria-label="Produtos" className="flex flex-col rounded-xl border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold">Produtos</h3>
      {products.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs text-muted">Nenhuma venda aprovada no período.</p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
          {products.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 truncate" title={p.name}>
                {p.name}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatNumber(p.quantity)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
