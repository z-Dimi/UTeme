"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { PRESET_LABEL, type Period, type Preset } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Order shown in the menu. "Personalizado" opens the date range inside the same panel. */
const OPTIONS: Preset[] = ["today", "yesterday", "last_7", "last_14", "this_month", "last_month"];

/**
 * One control for the whole period filter: "Hoje ▾" opens the list; "Personalizado" reveals a date range.
 * Plain links + a GET form, so the URL stays the single source of truth. `trailing` (the refresh button)
 * sits right after it.
 */
export function PeriodFilter({
  period,
  defaultFrom,
  defaultTo,
  basePath = "/",
  trailing,
}: {
  period: Period;
  defaultFrom: string;
  defaultTo: string;
  basePath?: string;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(period.preset === "custom");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-card-hover";

  return (
    <div className="flex items-center gap-2">
      <div ref={root} className="relative">
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            open && "border-border-hover",
          )}
        >
          {PRESET_LABEL[period.preset]}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>

        {open ? (
          <div
            data-state="open"
            className="menu-content absolute left-0 top-full z-30 mt-1.5 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-border-hover bg-surface p-1.5 shadow-lg"
          >
            <ul aria-label="Período" className="space-y-0.5">
              {OPTIONS.map((p) => (
                <li key={p}>
                  <Link
                    href={`${basePath}?period=${p}`}
                    onClick={() => setOpen(false)}
                    aria-current={period.preset === p ? "true" : undefined}
                    className={cn(item, period.preset === p && "bg-card-hover")}
                  >
                    {PRESET_LABEL[p]}
                    {period.preset === p ? <Check className="h-3.5 w-3.5 text-info" aria-hidden /> : null}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  aria-expanded={custom}
                  onClick={() => setCustom((c) => !c)}
                  className={cn(item, period.preset === "custom" && "bg-card-hover")}
                >
                  {PRESET_LABEL.custom}
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform duration-200", custom && "rotate-180")} aria-hidden />
                </button>
              </li>
            </ul>

            {custom ? (
              <form action={basePath} className="mt-1.5 space-y-2 border-t border-border p-2 pt-3">
                <input type="hidden" name="period" value="custom" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-muted">
                    De
                    <input name="from" type="date" required defaultValue={defaultFrom} className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground scheme-dark" />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted">
                    Até
                    <input name="to" type="date" required defaultValue={defaultTo} className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground scheme-dark" />
                  </label>
                </div>
                <button type="submit" className="h-8 w-full rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  Aplicar
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}
