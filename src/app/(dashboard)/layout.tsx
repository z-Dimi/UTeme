import { MobileBar, Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const maxDuration = 60; // manual Meta refresh runs inside a server action

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const projectId = workspace.activeProject.id;

  const [{ count: unread }, { data: gross }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("project_id", projectId).is("read_at", null),
    supabase.rpc("gross_revenue_total", { p_project: projectId }),
  ]);

  const shell = {
    unread: unread ?? 0,
    user: { fullName: workspace.user.fullName, email: workspace.user.email, avatarUrl: workspace.user.avatarUrl },
    goal: { currentCents: Number(gross ?? 0), goalCents: workspace.activeProject.revenueGoalCents },
    projects: workspace.projects.map((p) => ({ id: p.id, name: p.name })),
    activeProjectId: projectId,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <MobileBar {...shell} />
      <Sidebar {...shell} />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:px-8 md:pb-8 md:pt-10">{children}</main>
    </div>
  );
}
