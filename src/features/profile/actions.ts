"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validateAvatar } from "@/lib/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/server/services/workspace";

export type ProfileState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const BUCKET = "avatars";
const EXT = { png: "png", jpeg: "jpg", webp: "webp" } as const;

const schema = z.object({
  fullName: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  removeAvatar: z.string().optional(),
});

/** Object path inside the bucket, from one of our public URLs (null for anything else). */
function pathFromPublicUrl(url: string | null): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return url && i >= 0 ? url.slice(i + marker.length) : null;
}

export async function updateProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const parsed = schema.safeParse({ fullName: formData.get("fullName"), removeAvatar: formData.get("removeAvatar") ?? undefined });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }

  const workspace = await getWorkspace();
  const userId = workspace.user.id; // always the session user, never an id from the form
  const supabase = await createClient();
  const admin = createAdminClient();

  let avatarUrl: string | null | undefined; // undefined = unchanged
  let oldPath: string | null = null;

  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateAvatar({ size: file.size, type: file.type }, bytes);
    if (!check.ok) return { fieldErrors: { avatar: check.error } };

    // Unpredictable file name, namespaced by user id. The old file is removed after the profile points to the new one.
    const path = `${userId}/${randomBytes(12).toString("hex")}.${EXT[check.kind]}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: check.contentType, upsert: false });
    if (uploadError) {
      console.error("[profile] avatar upload failed", { message: uploadError.message });
      return { error: "Não foi possível enviar a foto." };
    }
    oldPath = pathFromPublicUrl(workspace.user.avatarUrl);
    avatarUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } else if (parsed.data.removeAvatar === "on") {
    oldPath = pathFromPublicUrl(workspace.user.avatarUrl);
    avatarUrl = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}) })
    .eq("id", userId);
  if (error) return { error: "Não foi possível salvar o perfil." };

  // Only delete objects inside the user's own folder.
  if (oldPath && oldPath.startsWith(`${userId}/`)) await admin.storage.from(BUCKET).remove([oldPath]);

  revalidatePath("/", "layout");
  return { ok: true };
}
