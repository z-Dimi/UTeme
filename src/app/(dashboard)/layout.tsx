import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("project_id", workspace.activeProject.id)
    .is("read_at", null);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar orgName={workspace.activeOrganization.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar workspace={workspace} unread={unread ?? 0} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
