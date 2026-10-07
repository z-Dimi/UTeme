import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSignedRequest } from "@/lib/meta/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Data Deletion Request Callback". Deletes everything we hold that came from this Meta user:
 * the connection (token included) and the structure/insights synced through it. Orders from the
 * payment gateway are not Meta data and are untouched.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload = typeof signed === "string" ? parseSignedRequest(signed, process.env.META_APP_SECRET ?? "") : null;
  if (!payload?.user_id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const db = createAdminClient();
  const { data: connections } = await db.from("meta_connections").select("id, project_id").eq("meta_user_id", payload.user_id);

  for (const c of connections ?? []) {
    for (const table of ["meta_metrics_daily", "meta_ads", "meta_adsets", "meta_campaigns"]) {
      await db.from(table).delete().eq("project_id", c.project_id);
    }
    await db.from("meta_connections").delete().eq("id", c.id);
  }

  const code = randomBytes(12).toString("hex");
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  // Meta shows this URL to the user so they can check the status of their request.
  return NextResponse.json({ url: `${origin}/data-deletion?code=${code}`, confirmation_code: code });
}
