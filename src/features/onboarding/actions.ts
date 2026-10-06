"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, slugify } from "@/lib/validation/auth";
import { ACTIVE_PROJECT_COOKIE } from "@/server/services/workspace";
import type { FormState } from "@/features/auth/actions";

export async function createWorkspace(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const base = slugify(parsed.data.organizationName) || "org";
  const { data, error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.organizationName,
    org_slug: `${base}-${randomBytes(3).toString("hex")}`,
    project_name: parsed.data.projectName,
    project_timezone: parsed.data.timezone,
  });

  const created = Array.isArray(data) ? data[0] : data;
  if (error || !created) {
    console.error("[onboarding] create_organization failed", { code: error?.code });
    return { error: "Não foi possível criar a organização. Tente novamente." };
  }

  (await cookies()).set(ACTIVE_PROJECT_COOKIE, created.project_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
