import "server-only";
import { createHmac } from "node:crypto";

const VERSION = process.env.META_API_VERSION ?? "v26.0";
export const GRAPH_URL = `https://graph.facebook.com/${VERSION}`;

/** Meta error codes worth retrying: unknown/temporary, rate limits, throttling. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const MAX_ATTEMPTS = 3;

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly transient = false,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
  /** Code 190 = invalid/expired token: the user must reconnect. */
  get isAuthError() {
    return this.code === 190;
  }
}

/** Required when the app enables "Require app secret". Harmless otherwise. */
export function appSecretProof(accessToken: string): string {
  return createHmac("sha256", process.env.META_APP_SECRET!).update(accessToken).digest("hex");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(url: string): Promise<T> {
  let lastError: MetaApiError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
    if (res.ok && !body.error) return body as T;

    const e = body.error;
    // The message may echo request details; never include the URL (it carries the token).
    lastError = new MetaApiError(
      e?.message ?? `Meta API HTTP ${res.status}`,
      res.status,
      e?.code,
      e?.error_subcode,
      res.status >= 500 || (e?.code !== undefined && TRANSIENT_CODES.has(e.code)),
    );
    if (!lastError.transient || attempt === MAX_ATTEMPTS) break;
    await sleep(1000 * 2 ** (attempt - 1));
  }
  throw lastError!;
}

function withAuth(path: string, params: Record<string, string | number | undefined>, accessToken: string) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_URL}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken));
  return url.toString();
}

export function graphGet<T>(path: string, params: Record<string, string | number | undefined>, accessToken: string) {
  return request<T>(withAuth(path, params, accessToken));
}

type Page<T> = { data: T[]; paging?: { next?: string } };

/** Follows `paging.next` (cursor URLs already carry auth) up to `maxPages`. */
export async function graphGetAll<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string,
  maxPages = 100,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = withAuth(path, params, accessToken);
  for (let i = 0; i < maxPages && url; i++) {
    const page: Page<T> = await request<Page<T>>(url);
    out.push(...page.data);
    url = page.paging?.next;
  }
  return out;
}

/** App-level calls (token exchange) authenticate with the app secret, not a user token. */
export function graphAppGet<T>(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_URL}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return request<T>(url.toString());
}
