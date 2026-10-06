"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          R
        </div>
        <span className="truncate text-[13px] font-semibold">{orgName}</span>
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon, soon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const base = "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150";

          if (soon) {
            return (
              <div
                key={href}
                aria-disabled="true"
                className={cn(base, "cursor-not-allowed text-muted/50")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{label}</span>
                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted">Em breve</span>
              </div>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                base,
                active
                  ? "bg-card text-foreground"
                  : "text-muted hover:bg-card-hover hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-info")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
