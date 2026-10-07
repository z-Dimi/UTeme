import Link from "next/link";
import { PRESET_LABEL, type Period, type Preset } from "@/lib/dates";
import { cn } from "@/lib/utils";

const QUICK: Preset[] = ["today", "yesterday", "last_7", "last_14", "last_30", "this_month", "last_month"];

/** Plain GET form + links: works without client JS, and the URL is the single source of truth. */
export function PeriodFilter({
  period,
  defaultFrom,
  defaultTo,
  basePath = "/",
}: {
  period: Period;
  defaultFrom: string;
  defaultTo: string;
  basePath?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Período" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-0.5">
        {QUICK.map((p) => (
          <Link
            key={p}
            href={`${basePath}?period=${p}`}
            aria-current={period.preset === p ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
              period.preset === p ? "bg-card text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {PRESET_LABEL[p]}
          </Link>
        ))}
      </nav>
      <form action={basePath} className="flex items-center gap-1.5 text-xs">
        <input type="hidden" name="period" value="custom" />
        <label className="sr-only" htmlFor="from">De</label>
        <input id="from" name="from" type="date" defaultValue={defaultFrom} className="h-8 rounded-md border border-border bg-surface px-2 text-xs scheme-dark" />
        <span className="text-muted">até</span>
        <label className="sr-only" htmlFor="to">Até</label>
        <input id="to" name="to" type="date" defaultValue={defaultTo} className="h-8 rounded-md border border-border bg-surface px-2 text-xs scheme-dark" />
        <button type="submit" className="h-8 rounded-md border border-border bg-surface px-3 hover:border-border-hover">
          Aplicar
        </button>
      </form>
    </div>
  );
}
