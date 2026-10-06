"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_PROJECT_COOKIE } from "@/server/services/workspace";

const schema = z.object({ projectId: z.string().uuid() });

export async function switchProject(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // RLS only returns projects the user belongs to: this is the authorization check.
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id").eq("id", parsed.data.projectId).maybeSingle();
  if (!data) return;

  (await cookies()).set(ACTIVE_PROJECT_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
