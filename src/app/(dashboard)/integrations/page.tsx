import Link from "next/link";
import { CreateIntegrationForm } from "@/features/integrations/create-form";
import { setIntegrationSecret, setIntegrationStatus } from "@/features/integrations/actions";
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
    .select("id, provider, name, status, last_event_at, secret_configured")
    .eq("project_id", workspace.activeProject.id)
    .order("created_at", { ascending: false });

  const { data: metaConn } = await supabase
    .from("meta_connections")
    .select("status, ad_account_name, pixel_id, last_sync_at")
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();

  const appUrl = process.env.APP_URL ?? "";
  const canManage = ["owner", "admin"].includes(workspace.activeOrganization.role);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Integrações</h2>
        <p className="text-muted">Conecte a plataforma de vendas que envia os pedidos para este projeto.</p>
      </header>

      <section aria-label="Advertising" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Anúncios</h3>
        <Link
          href="/integrations/meta"
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-hover hover:bg-card-hover"
        >
          <div>
            <p className="text-[13px] font-medium">Meta Ads</p>
            <p className="text-xs text-muted">
              {metaConn?.status === "connected"
                ? metaConn.ad_account_name
                  ? `${metaConn.ad_account_name} · Pixel ${metaConn.pixel_id ?? "—"} · última sincronização ${ago(metaConn.last_sync_at)}`
                  : "Conectado. Selecione a conta de anúncios para concluir."
                : "Sincronize campanhas, anúncios, investimento e conversões."}
            </p>
          </div>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${metaConn?.status === "connected" ? "bg-success/10 text-success" : "bg-surface text-muted"}`}
          >
            {metaConn?.status === "connected" ? "Conectado" : "Conectar"}
          </span>
        </Link>
      </section>

      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Vendas</h3>
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
                  <code className="mt-1 block select-all break-all text-[11px] text-muted">
                    {appUrl}/api/webhooks/{i.provider}/{i.id}
                  </code>
                </div>
                {i.status === "active" && !i.secret_configured ? (
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">Aguardando secret</span>
                ) : (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${i.status === "active" ? "bg-success/10 text-success" : "bg-surface text-muted"}`}
                  >
                    {i.status === "active" ? "Conectado" : "Inativo"}
                  </span>
                )}
                {canManage ? (
                  <form action={setIntegrationStatus}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value={i.status === "active" ? "inactive" : "active"} />
                    <Button type="submit" variant="secondary" size="sm">
                      {i.status === "active" ? "Desativar" : "Ativar"}
                    </Button>
                  </form>
                ) : null}
                {canManage && i.provider === "cakto" ? (
                  <details className="w-full text-xs" open={!i.secret_configured}>
                    <summary className="cursor-pointer text-info">
                      {i.secret_configured ? "Trocar secret" : "Definir secret (copie na Cakto, depois de criar o webhook)"}
                    </summary>
                    <form action={setIntegrationSecret} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <label className="sr-only" htmlFor={`secret-${i.id}`}>
                        Secret da Cakto
                      </label>
                      <input
                        id={`secret-${i.id}`}
                        name="secret"
                        type="password"
                        autoComplete="off"
                        required
                        minLength={8}
                        placeholder="Cole o secret gerado pela Cakto"
                        className="h-8 w-80 max-w-full rounded-md border border-border bg-surface px-3 text-xs placeholder:text-muted/70 hover:border-border-hover"
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Salvar secret
                      </Button>
                    </form>
                  </details>
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
