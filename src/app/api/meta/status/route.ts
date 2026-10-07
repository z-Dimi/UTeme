import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

/** Polled by the import progress panel. Reads through RLS with the user's session. */
export async function GET() {
  const workspace = await getWorkspace();
  const supabase = await createClient();
  const { data } = await supabase
    .from("meta_connections")
    .select("status, backfill_status, backfill_progress, last_sync_at, last_error")
    .eq("project_id", workspace.activeProject.id)
    .maybeSingle();
  return NextResponse.json(data ?? { status: "none" }, { headers: { "cache-control": "no-store" } });
}
