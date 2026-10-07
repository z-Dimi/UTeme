// Authenticated smoke test: seeds a tenant with sales + Meta data, signs in and opens EVERY screen of a
// deployed app, failing on any server error. Catches runtime-only bugs (server/client boundary, bad
// queries) that unit tests cannot. Run: BASE_URL=https://uteme.vercel.app npm run test:smoke
import { createCipheriv, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tag = Date.now();
const email = `smoke-${tag}@example.test`;
const password = `Pw-${tag}-zz`;

const encrypt = (plaintext) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(process.env.ENCRYPTION_KEY, "base64"), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
};
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

let userId = null;
let orgId = null;
try {
  // ---------------------------------------------------------------- seed
  const created = must(await db.auth.admin.createUser({ email, password, email_confirm: true }), "createUser");
  userId = created.user.id;
  orgId = must(await db.from("organizations").insert({ name: "Smoke Org", slug: `smoke-${tag}`, created_by: userId }).select("id").single(), "org").id;
  must(await db.from("organization_members").insert({ organization_id: orgId, user_id: userId, role: "owner" }).select("id").single(), "member");
  const projectId = must(await db.from("projects").insert({ organization_id: orgId, name: "Smoke Project" }).select("id").single(), "project").id;
  const scope = { organization_id: orgId, project_id: projectId };

  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 86400000));

  const customerId = must(await db.from("customers").insert({ ...scope, email: "buyer@example.test", name: "Comprador" }).select("id").single(), "customer").id;
  const mkOrder = async (ext, status, extra = {}) =>
    must(
      await db
        .from("orders")
        .insert({
          ...scope, provider: "custom", external_order_id: ext, status, payment_method: "pix", currency: "BRL",
          gross_amount: 19700, gateway_fee_amount: 1083, tax_amount: 1182, product_cost_amount: 3500, net_amount: 17435,
          customer_id: customerId, ordered_at: now.toISOString(), raw_source: "custom", tracking: { utm_source: "fb" }, ...extra,
        })
        .select("id")
        .single(),
      `order ${ext}`,
    ).id;
  const approvedId = await mkOrder(`ap-${tag}`, "approved", { approved_at: now.toISOString() });
  await mkOrder(`pe-${tag}`, "pending");
  await mkOrder(`rf-${tag}`, "refunded", { approved_at: now.toISOString(), refunded_at: now.toISOString(), refund_amount: 19700, net_amount: -1083, tax_amount: 0 });
  must(await db.from("order_items").insert({ ...scope, order_id: approvedId, name: "Produto Smoke", quantity: 1, unit_amount: 19700 }).select("id").single(), "item");

  const integrationId = must(
    await db.from("integrations").insert({ ...scope, provider: "custom", name: "Smoke hook", secret_encrypted: encrypt("s") }).select("id").single(),
    "integration",
  ).id;
  const eventId = must(
    await db
      .from("webhook_events")
      .insert({ ...scope, integration_id: integrationId, provider: "custom", fingerprint: `fp-${tag}`, event_type: "order.approved", external_order_id: `ap-${tag}`, payload: { ok: true }, status: "failed", error_message: "boom", attempt_count: 1 })
      .select("id")
      .single(),
    "webhook_event",
  ).id;
  must(await db.from("order_events").insert({ ...scope, order_id: approvedId, webhook_event_id: eventId, event_type: "order.approved", to_status: "approved", result: "applied", occurred_at: now.toISOString() }).select("id").single(), "order_event");

  await db.from("expenses").insert({ ...scope, name: "Criativo smoke", category: "creative", amount: 5000, incurred_on: today });
  await db.from("fee_rules").insert({ ...scope, kind: "meta_ads_tax", name: "Meta 12,15%", percentage: 12.15, valid_from: "2026-01-01T00:00:00Z" });
  await db.from("notifications").insert({ ...scope, type: "webhook_failed", title: "Webhook com erro", dedupe_key: `smoke-${tag}` });

  must(
    await db.from("meta_connections").insert({
      ...scope, meta_user_id: `mu-${tag}`, meta_user_name: "Smoke", access_token_encrypted: encrypt("tok"), status: "connected",
      ad_account_id: "act_1", ad_account_name: "Conta Smoke", ad_account_currency: "BRL", ad_account_timezone: "America/Sao_Paulo",
      pixel_id: "111", pixel_name: "Pixel Smoke", backfill_status: "done", last_sync_at: now.toISOString(),
    }).select("id").single(),
    "meta connection",
  );
  await db.from("meta_campaigns").insert({ ...scope, external_id: "c1", name: "Campanha Smoke", status: "ACTIVE" });
  await db.from("meta_adsets").insert({ ...scope, external_id: "s1", campaign_external_id: "c1", name: "Conjunto Smoke", status: "ACTIVE" });
  await db.from("meta_ads").insert({ ...scope, external_id: "a1", adset_external_id: "s1", campaign_external_id: "c1", name: "Anúncio Smoke", status: "PAUSED" });
  for (const date of [today, yesterday]) {
    must(
      await db.from("meta_metrics_daily").insert({
        ...scope, date, ad_account_id: "act_1", campaign_id: "c1", adset_id: "s1", ad_id: "a1", spend: 10000, impressions: 5000,
        clicks: 200, inline_link_clicks: 150, landing_page_views: 100, meta_initiate_checkouts: 20, meta_purchases: 5, meta_purchase_value: 50000,
      }).select("id").single(),
      `metrics ${date}`,
    );
  }

  // ---------------------------------------------------------------- sign in (same cookies the app sets)
  const jar = new Map();
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  must(await ssr.auth.signInWithPassword({ email, password }), "signIn");
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  assert.ok(jar.size > 0, "session cookies were produced");

  const get = async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text(), location: res.headers.get("location") };
  };
  const BROKEN = /This page couldn.t load|Application error|Internal Server Error|A server error occurred/i;

  // ---------------------------------------------------------------- every screen
  const pages = [
    ["/", ["Resumo", "Gastos com anúncios", "Funil de Conversão", "Produtos", "Produto Smoke", "Meta de faturamento", "R$ 394,00", "R$ 1 mi", "Editar perfil", "Atualizar", "Sair"]],
    ["/profile", ["Editar perfil", "Foto de perfil"]],
    ["/?period=today", ["Resumo", "Hoje"]],
    ["/?period=last_30", ["Resumo", "Últimos 30 dias"]],
    ["/?period=custom&from=2026-01-01&to=2026-12-31", ["Resumo"]],
    ["/meta", ["Campanha Smoke", "Investimento", "ROAS Meta"]],
    ["/meta?sort=roas&dir=asc&q=smoke", ["Campanha Smoke"]],
    ["/meta?period=yesterday", ["Meta Ads"]],
    ["/sales", ["Vendas", "Produto Smoke"]],
    [`/sales/${approvedId}`, ["Valor líquido", "Histórico", "Produto Smoke"]],
    ["/fees", ["Taxas", "Simulador", "Meta 12,15%"]],
    ["/expenses", ["Despesas", "Criativo smoke"]],
    ["/events", ["Eventos", "order.approved"]],
    ["/events?status=failed", ["order.approved"]],
    [`/events/${eventId}`, ["Reprocessar", "Payload"]],
    ["/integrations", ["Integrações", "Meta Ads", "Smoke hook"]],
    ["/integrations/meta", ["Conta Smoke", "Pixel Smoke"]],
    ["/notifications", ["Webhook com erro"]],
    ["/reports", ["Relatórios", "CSV"]],
    ["/settings", ["Configurações", "Smoke Project", "Meta de faturamento bruto", "1.000.000,00"]],
  ];
  for (const [path, expected] of pages) {
    const r = await get(path);
    assert.equal(r.status, 200, `${path} -> ${r.status} ${r.location ?? ""}`);
    assert.ok(!BROKEN.test(r.text), `${path} rendered an error page`);
    for (const needle of expected) assert.ok(r.text.includes(needle), `${path} should contain "${needle}"`);
  }

  // numbers on the summary: spend 2 days x R$100 = R$200 in the default 7-day window, Meta tax 12.15% = R$24,30
  const summary = (await get("/")).text;
  assert.ok(summary.includes("R$ 200,00"), "summary shows ad spend");
  assert.ok(summary.includes("R$ 24,30"), "summary applies Meta ads tax to spend");
  assert.ok(summary.includes("ROAS Meta 5,00"), "ROAS Meta = 1000 / 200");
  // Seeded operation loses money: profit, ROAS, ROI and margin all share the same (red) result color.
  const redCards = (summary.match(/tracking-tight text-danger/g) ?? []).length;
  assert.ok(redCards >= 4, `profit family is red when profit is negative (found ${redCards})`);

  // exports + JSON
  const csv = await get("/api/export/sales?period=last_30");
  assert.equal(csv.status, 200);
  assert.ok(csv.type.includes("text/csv") && csv.text.includes("Produto Smoke"));
  const exp = await get("/api/export/expenses?period=last_30");
  assert.ok(exp.text.includes("Criativo smoke"));
  const st = await get("/api/meta/status");
  assert.equal(st.status, 200);
  assert.equal(JSON.parse(st.text).backfill_status, "done");

  // branding: logo in the sidebar (and not the organization name there), on the login page, plus favicon
  assert.ok(summary.includes('alt="UTeme"'), "sidebar shows the UTeme logo");
  assert.ok(!summary.includes("Smoke Org"), "organization name no longer shown in the sidebar header");
  const login = await fetch(`${BASE_URL}/login`).then((r) => r.text());
  assert.ok(login.includes('alt="UTeme"'), "login shows the UTeme logo");
  const icon = await fetch(`${BASE_URL}/icon.png`);
  assert.equal(icon.status, 200);
  assert.ok((icon.headers.get("content-type") ?? "").includes("image/png"));
  const logoFile = await fetch(`${BASE_URL}/uteme-logo.png`);
  assert.equal(logoFile.status, 200);

  // profile photos bucket: public read, size/type limited, no client write policies
  const bucket = must(await db.storage.getBucket("avatars"), "avatars bucket");
  assert.equal(bucket.public, true);
  assert.equal(bucket.file_size_limit, 2097152);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp"]);

  // unauthenticated access is bounced to login
  const anon = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  assert.equal(anon.status, 307);

  console.log(`Smoke: ${pages.length} screens + exports OK against ${BASE_URL}`);
} finally {
  if (orgId) await db.from("organizations").delete().eq("id", orgId);
  if (userId) await db.auth.admin.deleteUser(userId);
}
