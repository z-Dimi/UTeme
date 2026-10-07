import "server-only";
import { graphAppGet, graphGet } from "./graph";

/** Minimum needed to read ad accounts, campaigns, pixels and insights. Add scopes only when a feature needs them. */
export const META_SCOPES = ["ads_read"];

export function redirectUri() {
  return process.env.META_REDIRECT_URI ?? `${process.env.APP_URL}/api/meta/callback`;
}

/** Facebook Login dialog URL (manual flow). `state` is verified in the callback (CSRF). */
export function buildLoginUrl(state: string) {
  const version = process.env.META_API_VERSION ?? "v26.0";
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

type TokenResponse = { access_token: string; token_type?: string; expires_in?: number };

/** code -> short-lived token -> long-lived token (~60 days). Server only. */
export async function exchangeCodeForLongLivedToken(code: string) {
  const short = await graphAppGet<TokenResponse>("oauth/access_token", {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri(),
    code,
  });
  const long = await graphAppGet<TokenResponse>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: short.access_token,
  });
  return {
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

export function fetchMe(accessToken: string) {
  return graphGet<{ id: string; name?: string }>("me", { fields: "id,name" }, accessToken);
}

export async function fetchGrantedScopes(accessToken: string): Promise<string[]> {
  const res = await graphGet<{ data: { permission: string; status: string }[] }>("me/permissions", {}, accessToken);
  return res.data.filter((p) => p.status === "granted").map((p) => p.permission);
}

export type MetaAdAccount = {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  business?: { id: string; name: string };
};

export type MetaPixel = { id: string; name: string; last_fired_time?: string; is_unavailable?: boolean };

export const ACCOUNT_STATUS: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Pendente de pagamento",
  7: "Em análise de risco",
  8: "Pagamento pendente",
  9: "Em período de carência",
  100: "Fechamento pendente",
  101: "Fechada",
};
