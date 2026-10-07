/** Server-side validation of an uploaded profile photo: size, declared type AND real file signature. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type AvatarKind = "png" | "jpeg" | "webp";

const MIME: Record<AvatarKind, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Detects the image type from magic bytes (never from the file name or the client-declared type). */
export function sniffImage(bytes: Uint8Array): AvatarKind | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (bytes.length >= 8 && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytes.length >= 3 && starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (bytes.length >= 12 && starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export function validateAvatar(file: { size: number; type: string }, bytes: Uint8Array):
  | { ok: true; kind: AvatarKind; contentType: string }
  | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "A foto deve ter no máximo 2 MB." };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." };
  // The declared type must agree with the real content (rejects e.g. an HTML file renamed to .png).
  if (file.type && file.type !== MIME[kind] && !(kind === "jpeg" && file.type === "image/jpg")) {
    return { ok: false, error: "O tipo do arquivo não corresponde ao conteúdo." };
  }
  return { ok: true, kind, contentType: MIME[kind] };
}
