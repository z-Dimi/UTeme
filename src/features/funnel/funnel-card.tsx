import { FunnelChart } from "@/components/ui/funnel-chart";
import { chartableStages, type FunnelStageData } from "@/lib/funnel";
import { UNAVAILABLE, formatNumber } from "@/lib/formatting";

const SOURCE_LABEL = { meta: "Meta Ads", gateway: "Gateway" } as const;
const STAGE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Real data only. The source of every stage is shown; unavailable stages are listed as "—", never invented. */
export function FunnelCard({ stages }: { stages: FunnelStageData[] }) {
  const drawable = chartableStages(stages);
  const data = drawable.map((s, i) => ({
    label: s.label,
    value: s.value,
    displayValue: formatNumber(s.value),
    color: STAGE_COLORS[Math.min(i, STAGE_COLORS.length - 1)],
  }));

  return (
    <section aria-label="Funil de Conversão — Meta Ads" className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold">Funil de Conversão — Meta Ads</h3>

      {data.length >= 2 ? (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[560px]">
            <FunnelChart
              data={data}
              orientation="horizontal"
              layers={3}
              edges="straight"
              showPercentage
              showValues
              showLabels
              formatPercentage={(p) => `${p.toFixed(p < 10 ? 1 : 0).replace(".", ",")}%`}
              className="max-h-64"
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs text-muted">
          Dados insuficientes para desenhar o funil. As etapas da Meta (cliques, visualizações, ICs e compras) aparecem
          depois que a conta de anúncios for conectada e sincronizada.
        </p>
      )}

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs md:grid-cols-5">
        {stages.map((s) => (
          <li key={s.key} className="flex flex-col">
            <span className="text-muted">{s.label}</span>
            <span className="tabular-nums text-[13px] font-medium">{s.value === null ? UNAVAILABLE : formatNumber(s.value)}</span>
            <span className="text-[10px] text-muted/70">
              {s.value === null ? "dados indisponíveis" : SOURCE_LABEL[s.source]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
