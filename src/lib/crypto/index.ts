import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope: "v1:<iv>:<tag>:<ciphertext>" (base64url parts).
 * Key comes from ENCRYPTION_KEY (32 bytes, base64). Never log plaintext or the key.
 */
function loadKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

export function encryptSecret(plaintext: string, keyB64?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

export function decryptSecret(envelope: string, keyB64?: string): string {
  const [version, iv, tag, ct] = envelope.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateSecret(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
