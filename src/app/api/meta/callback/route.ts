import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE } from "@/server/meta/constants";
import { MetaApiError } from "@/server/meta/graph";
import { exchangeCodeForLongLivedToken, fetchGrantedScopes, fetchMe, META_SCOPES } from "@/server/meta/oauth";
import { saveMetaConnection } from "@/server/meta/save-connection";
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

    await saveMetaConnection(workspace, { accessToken, expiresAt, scopes, me, method: "oauth" });
    return back(request);
  } catch (e) {
    console.error("[meta-oauth] callback failed", { code: e instanceof MetaApiError ? e.code : undefined });
    return back(request, "exchange");
  }
}
