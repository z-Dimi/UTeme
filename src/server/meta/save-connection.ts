import "server-only";
import { encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Workspace } from "@/server/services/workspace";

/**
 * Stores (or refreshes) the project's Meta connection. Used by the OAuth callback and by the
 * manual System User token flow. The token is encrypted here and never leaves the server.
 */
export async function saveMetaConnection(
  workspace: Workspace,
  input: {
    accessToken: string;
    expiresAt: Date | null;
    scopes: string[];
    me: { id: string; name?: string };
    method: "oauth" | "system_user_token";
  },
) {
  const db = createAdminClient();
  const { data: existing } = await db
    .from("meta_connections")
    .select("id, meta_user_id")
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();

  const base = {
    meta_user_id: input.me.id,
    meta_user_name: input.me.name ?? null,
    access_token_encrypted: encryptSecret(input.accessToken),
    token_expires_at: input.expiresAt?.toISOString() ?? null,
    scopes: input.scopes,
    status: "connected",
    last_error: null,
    connected_at: new Date().toISOString(),
  };

  if (existing) {
    // A different Meta identity means a different account universe: drop the previous selection.
    const reset =
      existing.meta_user_id !== input.me.id
        ? {
            ad_account_id: null,
            ad_account_name: null,
            ad_account_currency: null,
            ad_account_timezone: null,
            business_id: null,
            business_name: null,
            pixel_id: null,
            pixel_name: null,
            backfill_status: "pending",
            backfill_progress: {},
          }
        : {};
    await db.from("meta_connections").update({ ...base, ...reset }).eq("id", existing.id);
  } else {
    await db.from("meta_connections").insert({
      organization_id: workspace.activeOrganization.id,
      project_id: workspace.activeProject.id,
      ...base,
    });
  }

  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "meta.connected",
    target_type: "meta_connection",
    metadata: { meta_user_id: input.me.id, method: input.method },
  });
}
