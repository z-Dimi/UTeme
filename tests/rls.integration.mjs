// Integration check against a real Supabase project. Run: node --env-file=.env.local tests/rls.integration.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tag = Date.now();
const made = [];

async function mkUser(n) {
  const email = `rls-${tag}-${n}@example.test`;
  const password = `Pw-${tag}-${n}-xx`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  made.push(data.user.id);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  assert.ifError(e2);
  return { id: data.user.id, c };
}

try {
  const a = await mkUser("a");
  const b = await mkUser("b");
  const mk = async (u, name) => {
    const { data, error } = await u.c.rpc("create_organization", { org_name: name, org_slug: `${name}-${tag}`, project_name: `${name} proj` });
    assert.ifError(error);
    return data[0];
  };
  const oa = await mk(a, "orga");
  const ob = await mk(b, "orgb");

  const pa = await a.c.from("projects").select("id");
  assert.deepEqual(pa.data.map((p) => p.id), [oa.project_id], "A sees only its project");
  const ga = await a.c.from("organizations").select("id").eq("id", ob.organization_id);
  assert.equal(ga.data.length, 0, "A cannot read org B");
  const upd = await a.c.from("projects").update({ name: "hacked" }).eq("id", ob.project_id).select();
  assert.equal(upd.data.length, 0, "A cannot update B project");
  const ins = await a.c.from("projects").insert({ organization_id: ob.organization_id, name: "intruder" });
  assert.ok(ins.error, "A cannot insert into org B");
  const own = await a.c.from("organization_members").insert({ organization_id: oa.organization_id, user_id: b.id, role: "owner" });
  assert.ok(own.error, "cannot mint owner");
  const orgIns = await a.c.from("organizations").insert({ name: "direct", slug: `d-${tag}` });
  assert.ok(orgIns.error, "no direct org insert");
  const prof = await a.c.from("profiles").select("id");
  assert.deepEqual(prof.data.map((p) => p.id), [a.id], "A sees only own profile");
  // Aggregation RPCs and financial tables obey RLS too.
  await admin.from("orders").insert({
    organization_id: oa.organization_id, project_id: oa.project_id, provider: "custom", external_order_id: `o-${tag}`,
    status: "approved", gross_amount: 10000, net_amount: 10000, ordered_at: "2026-06-01T12:00:00Z",
    approved_at: "2026-06-01T12:00:00Z", raw_source: "custom",
  });
  const range = { p_from: "2026-06-01T00:00:00Z", p_to: "2026-06-02T00:00:00Z" };
  const mine = await a.c.rpc("summary_totals", { p_project: oa.project_id, ...range }).single();
  assert.equal(Number(mine.data.gross_revenue), 10000, "A sums its own orders");
  const peek = await b.c.rpc("summary_totals", { p_project: oa.project_id, ...range }).single();
  assert.equal(Number(peek.data.gross_revenue), 0, "B gets zeros for A's project");
  const hourly = await b.c.rpc("hourly_results", { p_project: oa.project_id, ...range, p_tz: "America/Sao_Paulo" });
  assert.equal((hourly.data ?? []).length, 0, "B sees no hourly data of A");
  const orders = await b.c.from("orders").select("id");
  assert.equal(orders.data.length, 0, "B cannot read A's orders");
  const integ = await a.c.from("integrations").select("secret_encrypted");
  assert.ok(integ.error, "secret column is not readable by clients");
  const write = await a.c.from("orders").update({ gross_amount: 1 }).eq("project_id", oa.project_id).select();
  assert.ok(write.error || write.data.length === 0, "clients cannot write orders");
  console.log("RLS isolation: all checks passed");
} finally {
  await admin.from("organizations").delete().like("slug", `%-${tag}`);
  for (const id of made) await admin.auth.admin.deleteUser(id);
}
