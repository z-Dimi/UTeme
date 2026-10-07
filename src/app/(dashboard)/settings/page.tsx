import { ProjectForm } from "@/features/settings/project-form";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Configurações" };

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  analyst: "Analista",
  media_buyer: "Gestor de tráfego",
  viewer: "Visualizador",
};

export default async function SettingsPage() {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("id, role, user_id")
    .eq("organization_id", workspace.activeOrganization.id)
    .order("created_at");

  const canEdit = ["owner", "admin"].includes(workspace.activeOrganization.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Configurações</h2>
        <p className="text-muted">
          {workspace.activeOrganization.name} · seu papel: {ROLE_LABEL[workspace.activeOrganization.role] ?? workspace.activeOrganization.role}
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-[13px] font-semibold">Projeto</h3>
        <ProjectForm
          name={workspace.activeProject.name}
          timezone={workspace.activeProject.timezone}
          goal={new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(workspace.activeProject.revenueGoalCents / 100)}
          canEdit={canEdit}
        />
        <p className="text-xs text-muted">Moeda: {workspace.activeProject.currency}. Outras moedas ainda não estão disponíveis.</p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Equipe</h3>
        <ul className="divide-y divide-border text-[13px]">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex justify-between py-2">
              <span className="text-muted">{m.user_id === workspace.user.id ? `${workspace.user.fullName} (você)` : `Membro ${m.user_id.slice(0, 8)}`}</span>
              <span>{ROLE_LABEL[m.role] ?? m.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Convite de membros: em breve.</p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 text-[13px]">
        <h3 className="mb-1 font-semibold">Meta Ads</h3>
        <p className="text-muted">Conta não conectada. A conexão depende das credenciais do aplicativo Meta (em breve).</p>
      </section>
    </div>
  );
}
