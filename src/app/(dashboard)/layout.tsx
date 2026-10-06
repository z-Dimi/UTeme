import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getWorkspace } from "@/server/services/workspace";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspace();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar orgName={workspace.activeOrganization.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar workspace={workspace} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
