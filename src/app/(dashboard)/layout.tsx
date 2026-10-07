import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { formatRelativeTime } from "@/lib/formatting";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const maxDuration = 60; // manual Meta refresh runs inside a server action

const currentTime = () => new Date();

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("project_id", workspace.activeProject.id)
    .is("read_at", null);

  const { data: meta } = await supabase
    .from("meta_connections")
    .select("status, backfill_status, ad_account_id, last_sync_at")
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();
  const metaSync =
    meta && meta.status !== "disconnected" && meta.ad_account_id
      ? meta.backfill_status === "done"
        ? { state: "ready" as const, label: `Atualizado ${formatRelativeTime(meta.last_sync_at, currentTime())}`, error: meta.status === "error" }
        : { state: "importing" as const, label: "Sincronizando…", error: false }
      : { state: "none" as const, label: "Meta não conectada", error: false };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar orgName={workspace.activeOrganization.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar workspace={workspace} unread={unread ?? 0} metaSync={metaSync} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
