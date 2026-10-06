"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { encryptSecret, generateSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";

export type CreateIntegrationState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Shown exactly once, right after creation. Never stored in plaintext. */
  created?: { id: string; provider: string; secret: string | null };
};

const schema = z.object({
  provider: z.enum(["cakto", "custom"]),
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  secret: z.string().trim().max(200).optional(),
});

const MANAGE_ROLES = ["owner", "admin"];

export async function createIntegration(
  _: CreateIntegrationState,
  formData: FormData,
): Promise<CreateIntegrationState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const { provider, name } = parsed.data;

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) {
    return { error: "Você não tem permissão para criar integrações." };
  }

  // Cakto generates its own webhook secret; we keep a copy to verify deliveries.
  // Custom integrations get a secret generated here.
  let secret: string;
  if (provider === "cakto") {
    if (!parsed.data.secret) return { fieldErrors: { secret: "Cole o secret do webhook da Cakto" } };
    secret = parsed.data.secret;
  } else {
    secret = generateSecret();
  }

  // organization/project come from the server-resolved workspace, never from the form.
  const { data, error } = await createAdminClient()
    .from("integrations")
    .insert({
      organization_id: workspace.activeOrganization.id,
      project_id: workspace.activeProject.id,
      provider,
      name,
      secret_encrypted: encryptSecret(secret),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[integrations] create failed", { code: error?.code });
    return { error: "Não foi possível criar a integração." };
  }

  revalidatePath("/integrations");
  return { created: { id: data.id, provider, secret: provider === "custom" ? secret : null } };
}

export async function setIntegrationStatus(formData: FormData) {
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) return;

  await createAdminClient()
    .from("integrations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("project_id", workspace.activeProject.id); // scope: cannot touch other projects
  revalidatePath("/integrations");
}
