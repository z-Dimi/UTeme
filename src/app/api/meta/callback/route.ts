import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATE_COOKIE } from "@/server/meta/constants";
import { MetaApiError } from "@/server/meta/graph";
import { exchangeCodeForLongLivedToken, fetchGrantedScopes, fetchMe, META_SCOPES } from "@/server/meta/oauth";
import { getWorkspace } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

const back = (request: NextRequest, error?: string) => {
  const url = new URL("/integrations/meta", request.url);
  if (error) url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/meta" });
  return res;
};

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back(request, sp.get("error") === "access_denied" ? "denied" : "oauth");

  const code = sp.get("code");
  const state = sp.get("state");
  const cookie = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !cookie) return back(request, "state");

  const [cookieState, cookieProject] = cookie.split(".");
  if (!cookieState || !cookieProject || !safeEqual(cookieState, state)) return back(request, "state");

  const workspace = await getWorkspace();
  // The project the flow started in must still be the active one, and the user must still be allowed.
  if (workspace.activeProject.id !== cookieProject || !["owner", "admin"].includes(workspace.activeOrganization.role)) {
    return back(request, "forbidden");
  }

  try {
    const { accessToken, expiresAt } = await exchangeCodeForLongLivedToken(code);
    const [me, scopes] = await Promise.all([fetchMe(accessToken), fetchGrantedScopes(accessToken)]);
    if (!META_SCOPES.every((s) => scopes.includes(s))) return back(request, "permissions");

    const db = createAdminClient();
    const { data: existing } = await db
      .from("meta_connections")
      .select("id, meta_user_id")
      .eq("project_id", workspace.activeProject.id)
      .maybeSingle();

    const base = {
      meta_user_id: me.id,
      meta_user_name: me.name ?? null,
      access_token_encrypted: encryptSecret(accessToken),
      token_expires_at: expiresAt?.toISOString() ?? null,
      scopes,
      status: "connected",
      last_error: null,
      connected_at: new Date().toISOString(),
    };

    if (existing) {
      // A different Facebook user means a different account universe: drop the previous selection.
      const reset =
        existing.meta_user_id !== me.id
          ? { ad_account_id: null, ad_account_name: null, ad_account_currency: null, ad_account_timezone: null, business_id: null, business_name: null, pixel_id: null, pixel_name: null, backfill_status: "pending", backfill_progress: {} }
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
      metadata: { meta_user_id: me.id, scopes },
    });
    return back(request);
  } catch (e) {
    console.error("[meta-oauth] callback failed", { code: e instanceof MetaApiError ? e.code : undefined });
    return back(request, "exchange");
  }
}
