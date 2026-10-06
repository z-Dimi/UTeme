"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";

export async function markAllNotificationsRead() {
  const workspace = await getWorkspace();
  await createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("project_id", workspace.activeProject.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
}
