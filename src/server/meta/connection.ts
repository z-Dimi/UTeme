import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { graphGetAll, MetaApiError } from "./graph";
import type { MetaAdAccount, MetaPixel } from "./oauth";
import { CONNECTION_COLUMNS, type MetaConnection } from "./sync";

/** Server-side only: returns the connection (with encrypted token) of a project, scoped by project id. */
export async function getProjectConnection(projectId: string): Promise<MetaConnection | null> {
  const { data } = await createAdminClient()
    .from("meta_connections")
    .select(CONNECTION_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle()
    .overrideTypes<MetaConnection, { merge: false }>();
  return data ?? null;
}

export function connectionToken(conn: MetaConnection): string | null {
  return conn.access_token_encrypted && conn.status === "connected" ? decryptSecret(conn.access_token_encrypted) : null;
}

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status";

export type AccountLookup = { accounts: MetaAdAccount[]; tried: { edge: string; count?: number; error?: string }[] };

/**
 * Ad accounts the token can read. Ordinary user tokens expose them on `me/adaccounts`; System User
 * tokens expose them as assigned assets (`me/assigned_ad_accounts`), and `me/adaccounts` may be empty.
 * Every edge is tried and merged by id; failures of one edge never hide the others.
 */
export async function lookupAdAccounts(token: string): Promise<AccountLookup> {
  const tried: AccountLookup["tried"] = [];
  const byId = new Map<string, MetaAdAccount>();

  for (const edge of ["me/adaccounts", "me/assigned_ad_accounts"]) {
    try {
      const rows = await graphGetAll<MetaAdAccount>(edge, { fields: ACCOUNT_FIELDS, limit: 100 }, token, 10);
      tried.push({ edge, count: rows.length });
      for (const a of rows) byId.set(a.id, a);
    } catch (e) {
      if (e instanceof MetaApiError && e.isAuthError) throw e; // an invalid token is not an "empty" result
      tried.push({ edge, error: e instanceof MetaApiError ? `${e.message} (código ${e.code ?? e.status})` : "falha ao consultar" });
    }
  }
  return { accounts: [...byId.values()], tried };
}

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const { accounts, tried } = await lookupAdAccounts(token);
  // Every edge failed (not merely empty): surface it instead of pretending there are no accounts.
  if (accounts.length === 0 && tried.length > 0 && tried.every((t) => t.error)) {
    throw new MetaApiError(tried[0].error ?? "Meta API error", 400);
  }
  return accounts;
}

export function listPixels(token: string, adAccountId: string) {
  return graphGetAll<MetaPixel>(`${adAccountId}/adspixels`, { fields: "id,name,last_fired_time,is_unavailable", limit: 100 }, token, 5);
}
