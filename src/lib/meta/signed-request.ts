import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Parses and verifies Meta's `signed_request` (deauthorize / data deletion callbacks):
 * "<base64url HMAC-SHA256 signature>.<base64url JSON payload>", signed with the app secret.
 * Returns the payload or null when invalid.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const [sig, payload] = signedRequest.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { algorithm?: string; user_id?: string };
    return data.algorithm?.toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}
