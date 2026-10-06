import { createHmac, timingSafeEqual } from "node:crypto";
import { decimalToCents } from "@/lib/money";
import { AdapterError, type VerifyResult } from "./types";

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Verifies `v1=<hex hmac-sha256(secret, "{timestamp}.{rawBody}")>` with replay protection. */
export function verifyHmacV1(args: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: Date;
}): VerifyResult {
  const { rawBody, timestamp, signature, secret, now = new Date() } = args;
  if (!timestamp || !signature) return { ok: false, reason: "missing_signature_headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(now.getTime() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`;
  // A future v2 may send several comma-separated signatures; accept if ours matches any.
  const candidates = signature.split(",").map((s) => s.trim());
  return candidates.some((c) => safeEqual(c, expected))
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

/** Money to integer cents. Accepts number or decimal string; rejects anything else. */
export function toCents(value: unknown, field: string): number {
  if (typeof value === "string" && value.trim() === "") throw new AdapterError(`${field} is empty`);
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) throw new AdapterError(`${field} is not a valid amount`);

  return decimalToCents(n);
}

export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return v.includes("@") ? v : undefined;
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function isoDate(value: unknown, field: string): string {
  const s = str(value);
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) throw new AdapterError(`${field} is not a valid date`);
  return d.toISOString();
}

const SENSITIVE_KEYS = /^(secret|authorization|token|access_token|refresh_token|password|api_key|apikey|x-cakto-signature|x-webhook-signature)$/i;

/** Deep-removes credentials before anything is persisted or displayed. */
export function sanitize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitize) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SENSITIVE_KEYS.test(k))
        .map(([k, v]) => [k, sanitize(v)]),
    ) as T;
  }
  return value;
}
