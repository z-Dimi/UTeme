import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { switchProject } from "@/features/onboarding/switch-project";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/server/services/workspace";

export function Topbar({ workspace, unread }: { workspace: Workspace; unread: number }) {
  const { projects, activeProject, activeOrganization, user } = workspace;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[13px] font-semibold">
          {activeOrganization.name}
          <span className="px-1.5 text-muted">/</span>
          {activeProject.name}
        </h1>
        <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />
          Sem fontes conectadas
        </span>
      </div>

      <div className="flex items-center gap-2">
        {projects.length > 1 ? (
          <form action={switchProject}>
            <label className="sr-only" htmlFor="project-switcher">
              Projeto
            </label>
            <select
              id="project-switcher"
              name="projectId"
              defaultValue={activeProject.id}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground hover:border-border-hover"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm" className="ml-1">
              Trocar
            </Button>
          </form>
        ) : null}

        <Link
          href="/notifications"
          aria-label={unread > 0 ? `Notificações (${unread} novas)` : "Notificações"}
          className="relative grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-card-hover hover:text-foreground"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden /> : null}
        </Link>
        <span className="hidden text-xs text-muted md:inline" title={user.email}>
          {user.fullName}
        </span>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </div>
    </header>
  );
}
