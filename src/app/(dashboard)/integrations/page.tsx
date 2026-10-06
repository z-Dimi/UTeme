import { CreateIntegrationForm } from "@/features/integrations/create-form";
import { setIntegrationStatus } from "@/features/integrations/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Integrações" };

const PROVIDER_LABEL: Record<string, string> = { cakto: "Cakto", custom: "Webhook personalizado" };

function ago(iso: string | null) {
  if (!iso) return "nenhum evento ainda";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

export default async function IntegrationsPage() {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, provider, name, status, last_event_at")
    .eq("project_id", workspace.activeProject.id)
    .order("created_at", { ascending: false });

  const appUrl = process.env.APP_URL ?? "";
  const canManage = ["owner", "admin"].includes(workspace.activeOrganization.role);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Integrações</h2>
        <p className="text-muted">Conecte a plataforma de vendas que envia os pedidos para este projeto.</p>
      </header>

      {canManage ? <CreateIntegrationForm appUrl={appUrl} /> : null}

      <section aria-label="Integrações de vendas" className="overflow-hidden rounded-xl border border-border bg-card">
        {integrations && integrations.length > 0 ? (
          <ul className="divide-y divide-border">
            {integrations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{i.name}</p>
                  <p className="truncate text-xs text-muted">
                    {PROVIDER_LABEL[i.provider] ?? i.provider} · último evento {ago(i.last_event_at)}
                  </p>
                  <code className="mt-1 block truncate text-[11px] text-muted">
                    {appUrl}/api/webhooks/{i.provider}/{i.id}
                  </code>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${i.status === "active" ? "bg-success/10 text-success" : "bg-surface text-muted"}`}
                >
                  {i.status === "active" ? "Conectado" : "Inativo"}
                </span>
                {canManage ? (
                  <form action={setIntegrationStatus}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value={i.status === "active" ? "inactive" : "active"} />
                    <Button type="submit" variant="secondary" size="sm">
                      {i.status === "active" ? "Desativar" : "Ativar"}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center text-muted">Nenhuma integração de vendas. Crie a primeira acima.</p>
        )}
      </section>
    </div>
  );
}
