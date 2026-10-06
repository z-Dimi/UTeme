"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";

export type ExpenseFormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const WRITE_ROLES = ["owner", "admin", "analyst"];

const schema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  category: z.enum(["creative", "influencer", "software", "staff", "freelancer", "other"]),
  amount: z.string().trim().min(1, "Informe o valor"),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  note: z.string().trim().max(500).optional(),
});

export async function createExpense(_: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const amount = parseBRLToCents(parsed.data.amount);
  if (amount === null || amount <= 0) return { fieldErrors: { amount: "Valor inválido" } };

  const workspace = await getWorkspace();
  if (!WRITE_ROLES.includes(workspace.activeOrganization.role)) {
    return { error: "Você não tem permissão para registrar despesas." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("expenses")
    .insert({
      organization_id: workspace.activeOrganization.id,
      project_id: workspace.activeProject.id,
      name: parsed.data.name,
      category: parsed.data.category,
      amount,
      incurred_on: parsed.data.incurred_on,
      note: parsed.data.note || null,
      created_by: workspace.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[expenses] create failed", { code: error?.code });
    return { error: "Não foi possível salvar a despesa." };
  }
  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "expense.created",
    target_type: "expense",
    target_id: data.id,
    metadata: { category: parsed.data.category, amount },
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteExpense(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const workspace = await getWorkspace();
  if (!WRITE_ROLES.includes(workspace.activeOrganization.role)) return;

  const db = createAdminClient();
  const { data } = await db
    .from("expenses")
    .delete()
    .eq("id", parsed.data.id)
    .eq("project_id", workspace.activeProject.id)
    .select("id, category, amount");
  if (!data?.length) return;
  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "expense.deleted",
    target_type: "expense",
    target_id: data[0].id,
    metadata: { category: data[0].category, amount: data[0].amount },
  });
  revalidatePath("/expenses");
  revalidatePath("/");
}
