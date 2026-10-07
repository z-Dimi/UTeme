import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSignedRequest } from "@/lib/meta/signed-request";

export const dynamic = "force-dynamic";

/** Meta calls this when a user removes the app. We drop the token and mark the connection disconnected. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload = typeof signed === "string" ? parseSignedRequest(signed, process.env.META_APP_SECRET ?? "") : null;
  if (!payload?.user_id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  await createAdminClient()
    .from("meta_connections")
    .update({ status: "disconnected", access_token_encrypted: null, token_expires_at: null, last_error: "Acesso removido na Meta" })
    .eq("meta_user_id", payload.user_id);
  return NextResponse.json({ ok: true });
}
