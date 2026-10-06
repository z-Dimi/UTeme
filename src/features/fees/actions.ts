"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBRLToCents, parsePercent } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/server/services/workspace";

export type FeeFormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const MANAGE_ROLES = ["owner", "admin"];

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : null));
const optionalInt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().int().min(1).max(36).nullable());

const schema = z.object({
  kind: z.enum(["gateway_fee", "tax", "product_cost", "meta_ads_tax"]),
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  provider: optionalText,
  external_product_id: optionalText,
  payment_method: optionalText,
  installment_min: optionalInt,
  installment_max: optionalInt,
  percentage: z.string().trim().optional(),
  fixed: z.string().trim().optional(),
  valid_from: z.string().trim().optional(),
  valid_until: z.string().trim().optional(),
});

function fromDate(value: string | undefined, fallback: Date | null): Date | null | "invalid" {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export async function createFeeRule(_: FeeFormState, formData: FormData): Promise<FeeFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const v = parsed.data;
  const fieldErrors: Record<string, string> = {};

  const percentage = v.percentage ? parsePercent(v.percentage) : 0;
  if (percentage === null) fieldErrors.percentage = "Percentual inválido (0 a 100)";
  const fixed = v.fixed ? parseBRLToCents(v.fixed) : 0;
  if (fixed === null || fixed < 0) fieldErrors.fixed = "Valor inválido";
  const validFrom = fromDate(v.valid_from, new Date());
  const validUntil = fromDate(v.valid_until, null);
  if (validFrom === "invalid" || validFrom === null) fieldErrors.valid_from = "Data inválida";
  if (validUntil === "invalid") fieldErrors.valid_until = "Data inválida";
  if (
    validFrom instanceof Date &&
    validUntil instanceof Date &&
    validUntil <= validFrom
  ) {
    fieldErrors.valid_until = "Precisa ser posterior ao início";
  }
  if (v.installment_min && v.installment_max && v.installment_max < v.installment_min) {
    fieldErrors.installment_max = "Menor que o mínimo";
  }
  if (percentage === 0 && fixed === 0) fieldErrors.percentage = "Informe percentual e/ou valor fixo";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) {
    return { error: "Você não tem permissão para alterar taxas." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("fee_rules")
    .insert({
      organization_id: workspace.activeOrganization.id,
      project_id: workspace.activeProject.id,
      kind: v.kind,
      name: v.name,
      provider: v.provider,
      external_product_id: v.external_product_id,
      payment_method: v.payment_method,
      installment_min: v.installment_min,
      installment_max: v.installment_max,
      percentage,
      fixed_amount: fixed,
      valid_from: (validFrom as Date).toISOString(),
      valid_until: validUntil instanceof Date ? validUntil.toISOString() : null,
      created_by: workspace.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[fees] create failed", { code: error?.code });
    return { error: "Não foi possível salvar a regra." };
  }

  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "fee_rule.created",
    target_type: "fee_rule",
    target_id: data.id,
    metadata: { kind: v.kind, name: v.name, percentage, fixed_amount: fixed },
  });

  revalidatePath("/fees");
  return { ok: true };
}

/** Closes a rule at "now". History is preserved: past sales still resolve to it. */
export async function endFeeRule(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspace = await getWorkspace();
  if (!MANAGE_ROLES.includes(workspace.activeOrganization.role)) return;

  const db = createAdminClient();
  const { data } = await db
    .from("fee_rules")
    .update({ valid_until: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("project_id", workspace.activeProject.id)
    .is("valid_until", null)
    .select("id, name, kind");
  if (!data?.length) return;

  await db.from("audit_logs").insert({
    organization_id: workspace.activeOrganization.id,
    project_id: workspace.activeProject.id,
    actor_id: workspace.user.id,
    action: "fee_rule.ended",
    target_type: "fee_rule",
    target_id: data[0].id,
    metadata: { kind: data[0].kind, name: data[0].name },
  });
  revalidatePath("/fees");
}
