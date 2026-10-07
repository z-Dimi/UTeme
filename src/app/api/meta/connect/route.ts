import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE } from "@/server/meta/constants";
import { buildLoginUrl } from "@/server/meta/oauth";
import { getWorkspace } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

/** Starts Facebook Login. Session is required (proxy); only owners/admins may connect. */
export async function GET(request: NextRequest) {
  const workspace = await getWorkspace();
  if (!["owner", "admin"].includes(workspace.activeOrganization.role)) {
    return NextResponse.redirect(new URL("/integrations/meta?error=forbidden", request.url));
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.redirect(new URL("/integrations/meta?error=not_configured", request.url));
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildLoginUrl(state));
  // Binds the flow to this browser AND this project; verified in the callback.
  response.cookies.set(STATE_COOKIE, `${state}.${workspace.activeProject.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  });
  return response;
}
