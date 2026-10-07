import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";
import { lookupAdAccounts } from "@/server/meta/connection";
import { CONNECTION_COLUMNS, runBackfill, runIncrementalSync, type MetaConnection } from "@/server/meta/sync";

/**
 * Sync engine against the REAL database with Meta's Graph API mocked (global fetch).
 * Verifies: endpoints/params, pagination, action mapping to cents, idempotent upserts,
 * backfill progress, failure handling and token never leaking into logs.
 */
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const tag = Date.now();
let orgId = "";
let projectId = "";
let userId = "";
let connId = "";

const calls: URL[] = [];
const realFetch = globalThis.fetch;

function graph(handler: (url: URL) => unknown) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith("graph.facebook.com")) return realFetch(input, init);
    calls.push(url);
    const body = handler(url);
    const status = (body as { error?: unknown })?.error ? 400 : 200;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function loadConn(): Promise<MetaConnection> {
  const { data, error } = await db.from("meta_connections").select(CONNECTION_COLUMNS).eq("id", connId).single();
  if (error) throw new Error(`loadConn: ${error.message} (connId=${connId})`);
  return data as unknown as MetaConnection;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || !res.data) throw new Error(`${what}: ${res.error?.message ?? "no data"}`);
  return res.data as NonNullable<T>;
}

beforeAll(async () => {
  const u = await db.auth.admin.createUser({ email: `meta-${tag}@example.test`, password: `Pw-${tag}-xx`, email_confirm: true });
  if (u.error || !u.data.user) throw new Error(`createUser: ${u.error?.message ?? "no user"}`);
  userId = u.data.user.id;
  orgId = must(await db.from("organizations").insert({ name: "Meta Org", slug: `meta-${tag}`, created_by: userId }).select("id").single(), "org").id;
  projectId = must(await db.from("projects").insert({ organization_id: orgId, name: "Meta Proj" }).select("id").single(), "project").id;
  connId = must(
    await db
      .from("meta_connections")
      .insert({
        organization_id: orgId,
        project_id: projectId,
        meta_user_id: `u-${tag}`,
        access_token_encrypted: encryptSecret("FAKE_TOKEN_SHOULD_NEVER_LEAK"),
        status: "connected",
        ad_account_id: "act_123",
        ad_account_timezone: "America/Sao_Paulo",
      })
      .select("id")
      .single(),
    "connection",
  ).id;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.from("organizations").delete().eq("id", orgId);
  await db.auth.admin.deleteUser(userId);
});

const insightRow = (date: string, ad: string, spend: string, purchases: string, value: string) => ({
  date_start: date,
  account_id: "123",
  campaign_id: "c1",
  adset_id: "s1",
  ad_id: ad,
  spend,
  impressions: "1000",
  reach: "800",
  clicks: "50",
  inline_link_clicks: "40",
  outbound_clicks: [{ action_type: "outbound_click", value: "30" }],
  actions: [
    { action_type: "landing_page_view", value: "30" },
    { action_type: "omni_initiated_checkout", value: "12" },
    { action_type: "omni_purchase", value: purchases },
    { action_type: "purchase", value: purchases },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: purchases },
  ],
  action_values: [
    { action_type: "omni_purchase", value },
    { action_type: "purchase", value },
  ],
});

const structure = (url: URL) => {
  if (url.pathname.endsWith("/campaigns")) return { data: [{ id: "c1", name: "Campanha 1", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_SALES" }] };
  if (url.pathname.endsWith("/adsets")) return { data: [{ id: "s1", name: "Conjunto 1", effective_status: "ACTIVE", campaign_id: "c1" }] };
  if (url.pathname.endsWith("/ads")) return { data: [{ id: "a1", name: "Anúncio 1", effective_status: "PAUSED", adset_id: "s1", campaign_id: "c1" }, { id: "a2", name: "Anúncio 2", effective_status: "ACTIVE", adset_id: "s1", campaign_id: "c1" }] };
  return null;
};

describe("meta sync engine", () => {
  it("backfill: imports structure + 30 days in windows, maps conversions once, reports progress", async () => {
    graph((url) => {
      const s = structure(url);
      if (s) return s;
      if (url.pathname.endsWith("/insights")) {
        const range = JSON.parse(url.searchParams.get("time_range")!) as { since: string; until: string };
        // one row per window, dated at the window's end
        return { data: [insightRow(range.until, "a1", "123.45", "2", "500.00")] };
      }
      return { data: [] };
    });

    await runBackfill(db, await loadConn());

    const conn = await loadConn();
    expect(conn.backfill_status).toBe("done");
    expect(conn.backfill_progress).toMatchObject({ step: "done", campaigns: 1, adsets: 1, ads: 2, windows_done: 5, windows_total: 5 });

    const insightCalls = calls.filter((u) => u.pathname.endsWith("/insights"));
    expect(insightCalls).toHaveLength(5);
    expect(insightCalls[0].searchParams.get("level")).toBe("ad");
    expect(insightCalls[0].searchParams.get("time_increment")).toBe("1");
    // appsecret_proof is sent, the raw secret never is
    expect(insightCalls[0].searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
    expect(insightCalls[0].toString()).not.toContain(process.env.META_APP_SECRET ?? "__none__");

    const { data: rows } = await db.from("meta_metrics_daily").select("*").eq("project_id", projectId);
    expect(rows).toHaveLength(5);
    expect(rows![0]).toMatchObject({
      spend: 12345, // cents
      meta_purchases: 2, // ONE action type, not 6
      meta_purchase_value: 50000,
      landing_page_views: 30,
      meta_initiate_checkouts: 12,
      outbound_clicks: 30,
    });

    const { data: runs } = await db.from("sync_runs").select("status, type").eq("project_id", projectId);
    expect(runs).toEqual([{ status: "success", type: "backfill" }]);
  });

  it("incremental sync is idempotent and picks up re-attributed conversions", async () => {
    const before = (await db.from("meta_metrics_daily").select("id", { count: "exact", head: true }).eq("project_id", projectId)).count;
    // Same ad/day as the most recent window, now with a re-attributed purchase count.
    const { data: latest } = await db.from("meta_metrics_daily").select("date").eq("project_id", projectId).order("date", { ascending: false }).limit(1).single();
    graph((url) => {
      const s = structure(url);
      if (s) return s;
      if (url.pathname.endsWith("/insights")) return { data: [insightRow(latest!.date, "a1", "123.45", "5", "900.00")] };
      return { data: [] };
    });

    await runIncrementalSync(db, await loadConn(), "recent");
    await runIncrementalSync(db, await loadConn(), "recent");

    const after = (await db.from("meta_metrics_daily").select("id", { count: "exact", head: true }).eq("project_id", projectId)).count;
    expect(after).toBe(before);
    const { data: row } = await db.from("meta_metrics_daily").select("meta_purchases, meta_purchase_value").eq("project_id", projectId).eq("date", latest!.date).single();
    expect(row).toEqual({ meta_purchases: 5, meta_purchase_value: 90000 });
  });

  it("aggregation RPCs sum per day / per ad", async () => {
    const { data: daily } = await db.rpc("meta_daily", { p_project: projectId, p_from: "2000-01-01", p_to: "2100-01-01" });
    expect(daily!.length).toBe(5);
    const { data: roll } = await db.rpc("meta_rollup", { p_project: projectId, p_from: "2000-01-01", p_to: "2100-01-01" });
    expect(roll).toHaveLength(1);
    expect(Number(roll![0].spend)).toBe(12345 * 5);
  });

  it("pagination: follows paging.next", async () => {
    let page = 0;
    graph((url) => {
      if (url.pathname.endsWith("/campaigns")) {
        page += 1;
        return page === 1
          ? { data: [{ id: "c1", name: "A" }], paging: { next: "https://graph.facebook.com/v26.0/act_123/campaigns?after=cursor&access_token=x" } }
          : { data: [{ id: "c2", name: "B" }] };
      }
      if (url.pathname.endsWith("/adsets") || url.pathname.endsWith("/ads")) return { data: [] };
      if (url.pathname.endsWith("/insights")) return { data: [] };
      return { data: [] };
    });
    await runIncrementalSync(db, await loadConn(), "reconcile");
    const { data } = await db.from("meta_campaigns").select("external_id").eq("project_id", projectId).order("external_id");
    expect(data!.map((c) => c.external_id)).toEqual(["c1", "c2"]);
  });

  it("failure: records the run, flags auth errors, notifies once, and never logs the token", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => void logs.push(JSON.stringify(args)));
    graph(() => ({ error: { message: "Error validating access token", code: 190, type: "OAuthException" } }));

    await expect(runIncrementalSync(db, await loadConn(), "recent")).rejects.toThrow();
    await expect(runIncrementalSync(db, await loadConn(), "recent")).rejects.toThrow();
    spy.mockRestore();

    const conn = await db.from("meta_connections").select("status, last_error").eq("id", connId).single();
    expect(conn.data!.status).toBe("error");
    expect(conn.data!.last_error).toContain("access token");

    const { data: notes } = await db.from("notifications").select("type").eq("project_id", projectId).eq("type", "meta_sync_failed");
    expect(notes).toHaveLength(1); // deduped per day
    expect(logs.join("")).not.toContain("FAKE_TOKEN_SHOULD_NEVER_LEAK");
    const { data: runs } = await db.from("sync_runs").select("status").eq("project_id", projectId).eq("status", "failed");
    expect(runs!.length).toBeGreaterThanOrEqual(2);
  });

  it("transient Meta errors are retried", async () => {
    let attempts = 0;
    await db.from("meta_connections").update({ status: "connected" }).eq("id", connId);
    graph((url) => {
      if (url.pathname.endsWith("/insights")) {
        attempts += 1;
        return attempts < 2 ? { error: { message: "Rate limit", code: 17 } } : { data: [] };
      }
      return { data: [] };
    });
    await runIncrementalSync(db, await loadConn(), "recent");
    expect(attempts).toBe(2);
  });

  it("system user tokens: finds accounts on assigned_ad_accounts when me/adaccounts is empty", async () => {
    const account = { id: "act_999", account_id: "999", name: "Conta SU", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 };
    graph((url) => {
      if (url.pathname.endsWith("/me/adaccounts")) return { data: [] };
      if (url.pathname.endsWith("/me/assigned_ad_accounts")) return { data: [account] };
      return { data: [] };
    });
    const found = await lookupAdAccounts("FAKE");
    expect(found.accounts.map((a) => a.id)).toEqual(["act_999"]);
    expect(found.tried).toEqual([
      { edge: "me/adaccounts", count: 0 },
      { edge: "me/assigned_ad_accounts", count: 1 },
    ]);
  });

  it("reports why when no edge returns accounts (diagnostic, not a silent empty list)", async () => {
    graph((url) =>
      url.pathname.endsWith("/me/assigned_ad_accounts")
        ? { error: { message: "(#200) Permissions error", code: 200 } }
        : { data: [] },
    );
    const found = await lookupAdAccounts("FAKE");
    expect(found.accounts).toEqual([]);
    expect(found.tried[0]).toEqual({ edge: "me/adaccounts", count: 0 });
    expect(found.tried[1].error).toContain("Permissions error");
  });

  it("RLS: another org cannot read these metrics", async () => {
    // service-role rows exist; an authenticated stranger sees none
    const stranger = await db.auth.admin.createUser({ email: `stranger-${tag}@example.test`, password: `Pw-${tag}-yy`, email_confirm: true });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: `stranger-${tag}@example.test`, password: `Pw-${tag}-yy` });
    expect((await anon.from("meta_metrics_daily").select("id")).data).toEqual([]);
    expect((await anon.from("meta_connections").select("id")).data).toEqual([]);
    const secret = await anon.from("meta_connections").select("access_token_encrypted");
    expect(secret.error).toBeTruthy();
    expect(Number(((await anon.rpc("meta_daily", { p_project: projectId, p_from: "2000-01-01", p_to: "2100-01-01" })).data ?? []).length)).toBe(0);
    await db.auth.admin.deleteUser(stranger.data.user!.id);
    expect(randomUUID()).toBeTruthy();
  });
});
