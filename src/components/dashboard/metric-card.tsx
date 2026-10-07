import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact KPI card. Every financial metric explains its formula in a tooltip.
 * `value` is already formatted by the central formatters; `colorClass` comes from getMetricColor.
 */
export function MetricCard({
  label,
  value,
  formula,
  colorClass,
  sub,
  loading,
}: {
  label: string;
  value: string;
  formula: string;
  colorClass?: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    // The grid stretches every card to the tallest one in its row; centering keeps cards without a
    // detail line visually balanced instead of top-heavy.
    <div className="group relative flex flex-col justify-center rounded-xl border border-border bg-card p-3.5 transition-colors duration-150 hover:border-border-hover hover:bg-card-hover">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-muted">{label}</p>
        <span tabIndex={0} aria-label={`Como é calculado: ${formula}`} className="text-muted/60 outline-none focus-visible:text-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      {loading ? (
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-surface" />
      ) : (
        <p className={cn("mt-1.5 text-xl font-semibold tabular-nums tracking-tight", colorClass)}>{value}</p>
      )}
      {sub ? <p className="mt-0.5 text-[11px] text-muted">{sub}</p> : null}
      <div
        role="tooltip"
        className="pointer-events-none absolute right-2 top-9 z-10 hidden w-56 rounded-lg border border-border-hover bg-surface p-2.5 text-[11px] leading-snug text-muted shadow-lg group-focus-within:block group-hover:block"
      >
        {formula}
      </div>
    </div>
  );
}
