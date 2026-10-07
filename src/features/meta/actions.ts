"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectionToken, getProjectConnection, listAdAccounts, listPixels, lookupAdAccounts } from "@/server/meta/connection";
import { MetaApiError } from "@/server/meta/graph";
import { fetchMe } from "@/server/meta/oauth";
import { saveMetaConnection } from "@/server/meta/save-connection";
import { runBackfill, runIncrementalSync } from "@/server/meta/sync";
import { getWorkspace } from "@/server/services/workspace";

const MANAGE_ROLES = ["owner", "admin"];
const MANUAL_COOLDOWN_MS = 60_000;

const selectSchema = z.object({
  account: z.string().regex(/^act_\d+$/),
  pixel: z.string().regex(/^\d+$/).or(z.literal("")),
});

const fail = (code: string): never => redirect(`/integrations/meta?error=${code}`);

/**
 * Saves the chosen ad account + Pixel and starts the 30-day import in the background.
 * Both ids are re-checked against what Meta says THIS token can see (never trust the form).
 */
export async function selectMetaTargets(formData: FormData) {
  const parsed = selectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("invalid");

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) return fail("forbidden");

  const conn = await getProjectConnection(workspace.activeProject.id);
  const token = conn ? connectionToken(conn) : null;
  if (!conn || !token) return fail("not_connected");

  let account, pixel;
  try {
    account = (await listAdAccounts(token)).find((a) => a.id === parsed.data.account);
    if (!account) return fail("account");
    const pixels = await listPixels(token, account.id);
    if (parsed.data.pixel) {
      pixel = pixels.find((p) => p.id === parsed.data.pixel);
      if (!pixel) return fail("pixel");
    } else if (pixels.length > 0) {
      return fail("pixel_required");
    }
  } catch (e) {
    if (e instanceof MetaApiError && e.isAuthError) return fail("token");
    console.error("[meta] selection lookup failed", { code: e instanceof MetaApiError ? e.code : undefined });
    return fail("meta_api");
  }

  if (account.currency.toUpperCase() !== workspace.activeProject.currency.toUpperCase()) {
    return fail("currency");
  }

  const db = createAdminClient();
  await db
    .from("meta_connections")
    .update({
      ad_account_id: account.id,
      ad_account_name: account.name,
      ad_account_currency: account.currency.toUpperCase(),
      ad_account_timezone: account.timezone_name,
      business_id: account.business?.id ?? null,
      business_name: account.business?.name ?? null,
      pixel_id: pixel?.id ?? null,
      pixel_name: pixel?.name ?? null,
      backfill_status: "running",
      backfill_progress: { step: "structure", days: 30 },
    })
    .eq("id", conn.id);
  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "meta.account_selected",
    target_type: "meta_connection",
    target_id: conn.id,
    metadata: { ad_account_id: account.id, pixel_id: pixel?.id ?? null },
  });

  const fresh = await getProjectConnection(workspace.activeProject.id);
  if (fresh) after(() => runBackfill(createAdminClient(), fresh).catch(() => undefined));

  revalidatePath("/", "layout");
  redirect("/integrations/meta");
}

/** Manual "Atualizar": re-syncs today + yesterday. Cooldown prevents spam against Meta's rate limits. */
export async function refreshMeta(): Promise<{ error?: string; ok?: boolean }> {
  const workspace = await getWorkspace();
  const conn = await getProjectConnection(workspace.activeProject.id);
  if (!conn || conn.status !== "connected" || !conn.ad_account_id || conn.backfill_status !== "done") {
    return { error: "A Meta ainda não está pronta para sincronizar." };
  }

  const db = createAdminClient();
  const { data: row } = await db.from("meta_connections").select("last_manual_sync_at").eq("id", conn.id).single();
  const last = row?.last_manual_sync_at ? new Date(row.last_manual_sync_at).getTime() : 0;
  if (Date.now() - last < MANUAL_COOLDOWN_MS) {
    return { error: "Aguarde um minuto antes de atualizar novamente." };
  }
  // Claim the slot first so concurrent clicks cannot all pass the cooldown check.
  const { data: claimed } = await db
    .from("meta_connections")
    .update({ last_manual_sync_at: new Date().toISOString() })
    .eq("id", conn.id)
    .or(`last_manual_sync_at.is.null,last_manual_sync_at.lt.${new Date(Date.now() - MANUAL_COOLDOWN_MS).toISOString()}`)
    .select("id");
  if (!claimed?.length) return { error: "Aguarde um minuto antes de atualizar novamente." };

  try {
    await runIncrementalSync(db, conn, "recent");
  } catch (e) {
    const detail = e instanceof MetaApiError && e.isAuthError ? "A conexão com a Meta expirou. Reconecte em Integrações." : "Não foi possível atualizar os dados da Meta.";
    return { error: detail };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function disconnectMeta(formData: FormData) {
  if (formData.get("confirm") !== "yes") return;
  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) return;

  const db = createAdminClient();
  await db
    .from("meta_connections")
    .update({ status: "disconnected", access_token_encrypted: null, token_expires_at: null, last_error: null })
    .eq("project_id", workspace.activeProject.id);
  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "meta.disconnected",
    target_type: "meta_connection",
    metadata: {},
  });
  revalidatePath("/", "layout");
  redirect("/integrations/meta");
}

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(40, "Token muito curto")
    .max(1000, "Token muito longo")
    .regex(/^[A-Za-z0-9_\-|.]+$/, "O token contém caracteres inválidos"),
});

/**
 * Connects with a System User access token generated in Meta Business Settings (no login dialog, no
 * app review, does not expire like a user token). The token is validated by actually listing the
 * ad accounts it can read, then stored encrypted.
 */
export async function connectWithToken(_: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const parsed = tokenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Token inválido" };

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) return { error: "Apenas proprietários e administradores podem conectar a Meta." };

  const token = parsed.data.token;
  let me;
  try {
    me = await fetchMe(token);
    const { accounts, tried } = await lookupAdAccounts(token);
    if (accounts.length === 0) {
      const detail = tried.map((t) => `${t.edge}: ${t.error ?? `${t.count} conta(s)`}`).join(" · ");
      return {
        error: `O token é válido (usuário ${me.name ?? me.id}), mas não enxerga nenhuma conta de anúncios. Atribua a conta de anúncios a este Usuário do Sistema (Atribuir ativos → Contas de anúncios) e gere o token de novo. Diagnóstico: ${detail}`,
      };
    }
  } catch (e) {
    if (e instanceof MetaApiError && e.isAuthError) return { error: "A Meta rejeitou o token (inválido ou expirado)." };
    console.error("[meta] token validation failed", { code: e instanceof MetaApiError ? e.code : undefined });
    return { error: e instanceof MetaApiError ? `Meta: ${e.message}` : "Não foi possível validar o token." };
  }

  await saveMetaConnection(workspace, { accessToken: token, expiresAt: null, scopes: ["ads_read"], me, method: "system_user_token" });
  revalidatePath("/", "layout");
  redirect("/integrations/meta");
}
