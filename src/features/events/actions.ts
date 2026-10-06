"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";
import { reprocessWebhookEvent } from "@/server/webhooks/ingest";

export async function reprocessEvent(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspace = await getWorkspace();
  if (!["owner", "admin"].includes(workspace.activeOrganization.role)) return;

  // projectId comes from the server-resolved workspace, so other projects' events are unreachable.
  const result = await reprocessWebhookEvent({ eventId: parsed.data.id, projectId: workspace.activeProject.id });

  await createAdminClient().from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "webhook_event.reprocessed",
    target_type: "webhook_event",
    target_id: parsed.data.id,
    metadata: { http_status: result.status, outcome: result.body.status ?? result.body.error ?? null },
  });
  revalidatePath("/events");
  revalidatePath(`/events/${parsed.data.id}`);
}
