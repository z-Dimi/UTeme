"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";

export type SettingsState = { error?: string; ok?: boolean; fieldErrors?: Record<string, string> };

const schema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido"),
  goal: z.string().trim().min(1, "Informe a meta"),
});

export async function updateProject(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const goalCents = parseBRLToCents(parsed.data.goal);
  if (goalCents === null || goalCents <= 0) return { fieldErrors: { goal: "Valor inválido" } };

  const workspace = await getWorkspace();
  if (!["owner", "admin"].includes(workspace.activeOrganization.role)) {
    return { error: "Você não tem permissão para alterar o projeto." };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("projects")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone, revenue_goal_cents: goalCents })
    .eq("id", workspace.activeProject.id)
    .eq("organization_id", workspace.activeOrganization.id);
  if (error) return { error: "Não foi possível salvar." };

  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "project.updated",
    target_type: "project",
    target_id: workspace.activeProject.id,
    metadata: { name: parsed.data.name, timezone: parsed.data.timezone, previous_timezone: workspace.activeProject.timezone },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
