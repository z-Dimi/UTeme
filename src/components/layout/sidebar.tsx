"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { ProfileDropdown } from "@/components/ui/profile-dropdown";
import { logout } from "@/features/auth/actions";
import { switchProject } from "@/features/onboarding/switch-project";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export type SidebarProps = {
  unread: number;
  user: { fullName: string; email: string; avatarUrl: string | null };
  goal: { currentCents: number; goalCents: number };
  projects: { id: string; name: string }[];
  activeProjectId: string;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function GoalCard({ currentCents, goalCents }: SidebarProps["goal"]) {
  const ratio = goalCents > 0 ? currentCents / goalCents : 0;
  const width = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium">Meta de faturamento</p>
        <p className="text-[11px] tabular-nums text-muted">{formatPercent(ratio, 1)}</p>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso da meta de faturamento bruto"
        aria-valuemin={0}
        aria-valuemax={goalCents}
        aria-valuenow={Math.min(currentCents, goalCents)}
        className="h-1.5 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${width}%` }} />
      </div>
      <div className="flex items-baseline justify-between text-[11px] text-muted">
        <span>R$ 0</span>
        <span>{formatCompactCurrency(goalCents)}</span>
      </div>
      <p className="text-[11px] text-muted">
        Faturamento bruto acumulado: <span className="tabular-nums text-foreground">{formatCurrency(currentCents)}</span>
      </p>
    </div>
  );
}

function ProfileFooter({ user, projects, activeProjectId }: Pick<SidebarProps, "user" | "projects" | "activeProjectId">) {
  return (
    <div className="space-y-2 border-t border-border p-2">
      {projects.length > 1 ? (
        <form action={switchProject} className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="project-switcher">
            Projeto
          </label>
          <select
            id="project-switcher"
            name="projectId"
            defaultValue={activeProjectId}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-foreground hover:border-border-hover"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-md border border-border bg-surface px-2.5 text-xs hover:border-border-hover">
            Trocar
          </button>
        </form>
      ) : null}

      <ProfileDropdown data={{ name: user.fullName, email: user.email, avatarUrl: user.avatarUrl }} />
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-16 items-center justify-center border-b border-border px-4">
        <Link href="/" aria-label="UTeme, página inicial">
          <Logo height={26} priority />
        </Link>
      </div>

      <nav aria-label="Principal" className="space-y-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon, soon }) => {
          const active = isActive(pathname, href);
          const base = "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150";

          if (soon) {
            return (
              <div key={href} aria-disabled="true" className={cn(base, "cursor-not-allowed text-muted/50")}>
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
              className={cn(base, active ? "bg-card text-foreground" : "text-muted hover:bg-card-hover hover:text-foreground")}
            >
              <Icon className={cn("h-4 w-4", active && "text-info")} aria-hidden />
              <span className="flex-1">{label}</span>
              {href === "/notifications" && props.unread > 0 ? (
                <span
                  aria-label={`${props.unread} novas`}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
                >
                  {props.unread > 9 ? "9+" : props.unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 p-2">
        <GoalCard {...props.goal} />
      </div>
      <ProfileFooter user={props.user} projects={props.projects} activeProjectId={props.activeProjectId} />
    </aside>
  );
}

/** Below md the sidebar is hidden: a compact bar keeps navigation, profile and logout reachable. */
export function MobileBar(props: SidebarProps) {
  const pathname = usePathname();
  return (
    <header className="shrink-0 border-b border-border bg-sidebar md:hidden">
      <div className="flex h-12 items-center justify-between px-3">
        <Link href="/" aria-label="UTeme, página inicial">
          <Logo height={20} priority />
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/profile" aria-label="Editar perfil">
            <Avatar src={props.user.avatarUrl} size={28} />
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Sair" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:text-foreground">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-2 pb-2">
        {NAV_ITEMS.filter((n) => !n.soon).map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs",
              isActive(pathname, href) ? "bg-card text-foreground" : "text-muted",
            )}
          >
            {label}
            {href === "/notifications" && props.unread > 0 ? ` (${props.unread})` : ""}
          </Link>
        ))}
      </nav>
    </header>
  );
}
