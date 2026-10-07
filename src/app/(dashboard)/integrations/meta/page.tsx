import Link from "next/link";
import { Button } from "@/components/ui/button";
import { disconnectMeta, selectMetaTargets } from "@/features/meta/actions";
import { ImportProgress } from "@/features/meta/import-progress";
import { TokenForm } from "@/features/meta/token-form";
import { createClient } from "@/lib/supabase/server";
import { connectionToken, getProjectConnection, listAdAccounts, listPixels } from "@/server/meta/connection";
import { MetaApiError } from "@/server/meta/graph";
import { ACCOUNT_STATUS, type MetaAdAccount, type MetaPixel } from "@/server/meta/oauth";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Meta Ads" };
// The import runs in the background of the "select account" action.
export const maxDuration = 300;

const ERRORS: Record<string, string> = {
  forbidden: "Apenas proprietários e administradores podem conectar a Meta.",
  not_configured: "O aplicativo Meta não está configurado neste ambiente.",
  denied: "Você cancelou a autorização na Meta.",
  oauth: "A Meta retornou um erro durante o login.",
  state: "A sessão de login expirou ou é inválida. Tente conectar novamente.",
  permissions: "Aceite a permissão de leitura de anúncios (ads_read) para continuar.",
  exchange: "Não foi possível concluir a conexão com a Meta. Tente novamente.",
  invalid: "Seleção inválida.",
  not_connected: "Conecte a Meta antes de selecionar a conta.",
  account: "Essa conta de anúncios não está disponível para o seu login.",
  pixel: "Esse Pixel não pertence à conta selecionada.",
  pixel_required: "Esta conta possui Pixels. Selecione um para continuar.",
  currency: "A moeda da conta de anúncios é diferente da moeda do projeto. Por enquanto só é possível usar contas na mesma moeda.",
  token: "A conexão com a Meta expirou. Reconecte sua conta.",
  meta_api: "A Meta não respondeu como esperado. Tente novamente em instantes.",
};

export default async function MetaIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getWorkspace();
  const projectId = workspace.activeProject.id;
  const canManage = ["owner", "admin"].includes(workspace.activeOrganization.role);

  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("meta_connections")
    .select(
      "status, meta_user_name, token_expires_at, ad_account_id, ad_account_name, ad_account_currency, ad_account_timezone, business_name, pixel_id, pixel_name, backfill_status, backfill_progress, last_sync_at, last_error",
    )
    .eq("project_id", projectId)
    .maybeSingle();

  const error = sp.error ? (ERRORS[sp.error] ?? "Algo deu errado.") : null;
  const connected = conn?.status === "connected";
  const selected = connected && conn?.ad_account_id;

  // Lookups against Meta only happen while the user is choosing; never on every page load.
  let accounts: MetaAdAccount[] = [];
  let pixels: MetaPixel[] = [];
  let lookupError: string | null = null;
  if (connected && !selected && canManage) {
    const server = await getProjectConnection(projectId);
    const token = server ? connectionToken(server) : null;
    if (token) {
      try {
        accounts = await listAdAccounts(token);
        if (sp.account && accounts.some((a) => a.id === sp.account)) pixels = await listPixels(token, sp.account);
      } catch (e) {
        lookupError = e instanceof MetaApiError && e.isAuthError ? ERRORS.token : ERRORS.meta_api;
      }
    }
  }

  const tz = workspace.activeProject.timezone;
  const fmt = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(new Date(iso)) : "—";
  const chosen = accounts.find((a) => a.id === sp.account);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <Link href="/integrations" className="text-xs text-info hover:underline">
          ← Integrações
        </Link>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Meta Ads</h2>
        <p className="text-muted">Sincronize campanhas, anúncios, investimento e conversões.</p>
      </header>

      {error || lookupError ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {error ?? lookupError}
        </p>
      ) : null}

      {!connected ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-6 text-center">
          <h3 className="text-[13px] font-semibold">{conn?.status === "disconnected" ? "Meta desconectada" : "Nenhuma conta Meta conectada"}</h3>
          <p className="text-xs text-muted">Conecte sua conta para começar. Pedimos apenas acesso de leitura aos seus anúncios (ads_read).</p>
          {canManage ? (
            <a
              href="/api/meta/connect"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Conectar Meta
            </a>
          ) : (
            <p className="text-xs text-muted">Peça a um administrador para conectar.</p>
          )}
        </section>
      ) : null}

      {!connected && canManage ? <TokenForm /> : null}

      {connected && !selected ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Conectado como {conn?.meta_user_name ?? "usuário Meta"}.</p>

          {!chosen ? (
            <>
              <h3 className="text-[13px] font-semibold">1. Selecione a conta de anúncios</h3>
              {accounts.length === 0 && !lookupError ? (
                <p className="text-xs text-muted">Nenhuma conta de anúncios encontrada para este login.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {accounts.map((a) => (
                    <li key={a.id}>
                      <Link href={`/integrations/meta?account=${a.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-card-hover">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{a.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {a.id} · {a.currency} · {a.timezone_name}
                            {a.business ? ` · ${a.business.name}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">{ACCOUNT_STATUS[a.account_status] ?? `Status ${a.account_status}`}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <form action={selectMetaTargets} className="space-y-4">
              <input type="hidden" name="account" value={chosen.id} />
              <div>
                <h3 className="text-[13px] font-semibold">Conta: {chosen.name}</h3>
                <p className="text-[11px] text-muted">
                  {chosen.id} · {chosen.currency} · {chosen.timezone_name} ·{" "}
                  <Link href="/integrations/meta" className="text-info hover:underline">
                    trocar
                  </Link>
                </p>
              </div>
              <h3 className="text-[13px] font-semibold">2. Selecione o Pixel</h3>
              {pixels.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Esta conta não tem Pixels. Você pode continuar sem Pixel; os dados de campanhas funcionam normalmente.</p>
                  <input type="hidden" name="pixel" value="" />
                </div>
              ) : (
                <fieldset className="divide-y divide-border rounded-lg border border-border">
                  <legend className="sr-only">Pixel</legend>
                  {pixels.map((p, i) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-card-hover">
                      <input type="radio" name="pixel" value={p.id} defaultChecked={i === 0} required className="accent-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{p.name}</span>
                        <span className="block text-[11px] text-muted">
                          ID {p.id} · {p.is_unavailable ? "indisponível" : p.last_fired_time ? `último evento ${fmt(p.last_fired_time)}` : "sem eventos recentes"}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <Button type="submit">Concluir e importar 30 dias</Button>
            </form>
          )}
        </section>
      ) : null}

      {selected && conn ? (
        <>
          {conn.backfill_status !== "done" ? (
            <ImportProgress initial={{ status: conn.status, backfill_status: conn.backfill_status, backfill_progress: conn.backfill_progress, last_error: conn.last_error }} />
          ) : null}

          <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Meta Ads</h3>
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] text-success">Conectado</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-3">
              {(
                [
                  ["Conta", `${conn.ad_account_name} (${conn.ad_account_id})`],
                  ["Business", conn.business_name ?? "—"],
                  ["Pixel", conn.pixel_id ? `${conn.pixel_name ?? ""} (${conn.pixel_id})` : "—"],
                  ["Moeda", conn.ad_account_currency ?? "—"],
                  ["Fuso da conta", conn.ad_account_timezone ?? "—"],
                  ["Última sincronização", fmt(conn.last_sync_at)],
                  ["Token expira em", fmt(conn.token_expires_at)],
                  ["Login Meta", conn.meta_user_name ?? "—"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {conn.ad_account_timezone && conn.ad_account_timezone !== tz ? (
              <p className="text-[11px] text-warning">
                O dia da Meta segue o fuso da conta de anúncios ({conn.ad_account_timezone}); o projeto usa {tz}. Para vendas e
                gastos coincidirem no mesmo “hoje”, use o mesmo fuso nos dois.
              </p>
            ) : null}
            {conn.last_error ? <p className="text-xs text-danger">Último erro: {conn.last_error}</p> : null}
          </section>

          {canManage ? (
            <section className="space-y-2 rounded-xl border border-border bg-card p-4">
              <h3 className="text-[13px] font-semibold">Desconectar</h3>
              <p className="text-xs text-muted">
                Apaga o token de acesso. Os dados já importados são mantidos. Para revogar também na Meta, remova o app em
                Configurações do Facebook → Integrações de negócios.
              </p>
              <form action={disconnectMeta} className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="confirm" value="yes" required className="accent-danger" />
                  Confirmo que quero desconectar a Meta
                </label>
                <Button type="submit" variant="danger" size="sm">
                  Desconectar
                </Button>
              </form>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
