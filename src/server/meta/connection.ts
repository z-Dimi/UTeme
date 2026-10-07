import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { graphGetAll } from "./graph";
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

export function listAdAccounts(token: string) {
  return graphGetAll<MetaAdAccount>(
    "me/adaccounts",
    { fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}", limit: 100 },
    token,
    10,
  );
}

export function listPixels(token: string, adAccountId: string) {
  return graphGetAll<MetaPixel>(`${adAccountId}/adspixels`, { fields: "id,name,last_fired_time,is_unavailable", limit: 100 }, token, 5);
}
