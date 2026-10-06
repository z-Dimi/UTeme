// End-to-end webhook check against a running deployment and the real Supabase project.
// Run: BASE_URL=https://uteme.vercel.app node --env-file=.env.local tests/webhook.e2e.mjs
import { createCipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const tag = Date.now();

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(process.env.ENCRYPTION_KEY, "base64"), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

const sign = (secret, ts, body) => `v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

async function post(provider, integrationId, body, headers = {}) {
  const res = await fetch(`${BASE_URL}/api/webhooks/${provider}/${integrationId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const caktoOrder = (id, over = {}) => ({
  id,
  refId: "R1",
  status: "paid",
  baseAmount: 197.0,
  amount: 197.0,
  discount: "0.00",
  installments: 1,
  paymentMethod: "pix",
  customer: { name: "E2E Buyer", email: `E2E-${tag}@Example.test`, docNumber: "123" },
  product: { id: `prod-${tag}`, name: "Produto E2E" },
  offer: { currency: "BRL" },
  utm_source: "fb",
  createdAt: "2026-06-01T10:00:00-03:00",
  paidAt: "2026-06-01T10:01:00-03:00",
  refundedAt: "2026-06-02T10:00:00-03:00",
  chargedbackAt: "2026-06-03T10:00:00-03:00",
  ...over,
});

async function sendCakto(integrationId, secret, event, data, { tamper = false } = {}) {
  const body = JSON.stringify({ secret, event, data });
  const ts = String(Math.floor(Date.now() / 1000));
  return post("cakto", integrationId, body, {
    "x-cakto-timestamp": ts,
    "x-cakto-signature": sign(tamper ? "wrong" : secret, ts, body),
  });
}

const created = { userId: null, orgId: null };
try {
  const { data: u, error: ue } = await db.auth.admin.createUser({
    email: `e2e-${tag}@example.test`,
    password: `Pw-${tag}-xx`,
    email_confirm: true,
  });
  assert.ifError(ue);
  created.userId = u.user.id;
  const { data: org, error: oe } = await db
    .from("organizations")
    .insert({ name: "E2E Org", slug: `e2e-${tag}`, created_by: u.user.id })
    .select("id")
    .single();
  assert.ifError(oe);
  created.orgId = org.id;
  const { data: proj } = await db.from("projects").insert({ organization_id: org.id, name: "E2E Project" }).select("id").single();

  const caktoSecret = randomUUID();
  const customSecret = randomBytes(24).toString("hex");
  const mkIntegration = async (provider, secret) => {
    const { data, error } = await db
      .from("integrations")
      .insert({ organization_id: org.id, project_id: proj.id, provider, name: `${provider} e2e`, secret_encrypted: encrypt(secret) })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  };
  const caktoId = await mkIntegration("cakto", caktoSecret);
  const customId = await mkIntegration("custom", customSecret);

  const orderId = randomUUID();
  const getOrder = async (ext) =>
    (await db.from("orders").select("*").eq("project_id", proj.id).eq("external_order_id", ext).maybeSingle()).data;

  // 1. approved sale creates customer, product, order, item and a history entry
  let r = await sendCakto(caktoId, caktoSecret, "purchase_approved", caktoOrder(orderId));
  assert.deepEqual([r.status, r.json.status], [200, "processed"], "approved is processed");
  let order = await getOrder(orderId);
  assert.equal(order.status, "approved");
  assert.equal(order.gross_amount, 19700);
  assert.equal(order.net_amount, 19700);
  assert.equal(order.tracking.utm_source, "fb");
  const { data: cust } = await db.from("customers").select("email").eq("project_id", proj.id);
  assert.deepEqual(cust.map((c) => c.email), [`e2e-${tag}@example.test`], "email normalized, one customer");

  // 2. replaying the same delivery changes nothing
  r = await sendCakto(caktoId, caktoSecret, "purchase_approved", caktoOrder(orderId));
  assert.equal(r.json.duplicate, true, "replay detected");
  const { count: orderCount } = await db.from("orders").select("id", { count: "exact", head: true }).eq("project_id", proj.id);
  assert.equal(orderCount, 1);
  const { count: evCount } = await db.from("order_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
  assert.equal(evCount, 1, "no duplicated history");

  // 3. refund lowers net revenue; gross is kept for audit
  r = await sendCakto(caktoId, caktoSecret, "refund", caktoOrder(orderId, { status: "refunded" }));
  assert.equal(r.json.status, "processed");
  order = await getOrder(orderId);
  assert.deepEqual([order.status, order.refund_amount, order.net_amount, order.gross_amount], ["refunded", 19700, 0, 19700]);
  assert.ok(order.refunded_at);

  // 4. a late "pix generated" webhook must not regress a refunded order
  r = await sendCakto(caktoId, caktoSecret, "pix_gerado", caktoOrder(orderId, { status: "waiting_payment" }));
  assert.equal(r.json.status, "ignored", "regression blocked");
  assert.equal((await getOrder(orderId)).status, "refunded");

  // 5. bad signature -> 401 and nothing stored
  const before = (await db.from("webhook_events").select("id", { count: "exact", head: true }).eq("project_id", proj.id)).count;
  r = await sendCakto(caktoId, caktoSecret, "purchase_approved", caktoOrder(randomUUID()), { tamper: true });
  assert.equal(r.status, 401);
  const after = (await db.from("webhook_events").select("id", { count: "exact", head: true }).eq("project_id", proj.id)).count;
  assert.equal(after, before, "rejected webhooks are not stored");

  // 6. unknown / wrong integration -> 404 (no enumeration)
  r = await sendCakto(randomUUID(), caktoSecret, "purchase_approved", caktoOrder(randomUUID()));
  assert.equal(r.status, 404);
  r = await post("custom", caktoId, "{}"); // right id, wrong provider
  assert.equal(r.status, 404);

  // 7. chargeback on a second order, arriving before any approval (unknown order)
  const cbId = randomUUID();
  r = await sendCakto(caktoId, caktoSecret, "chargeback", caktoOrder(cbId));
  assert.equal(r.json.status, "processed");
  const cb = await getOrder(cbId);
  assert.deepEqual([cb.status, cb.chargeback_amount, cb.net_amount], ["chargeback", 19700, 0]);

  // 8. credentials never reach the stored payload
  const { data: events } = await db.from("webhook_events").select("payload, headers, status").eq("project_id", proj.id);
  assert.ok(events.length >= 4);
  for (const e of events) {
    assert.equal(e.payload.secret, undefined, "secret stripped from payload");
    assert.equal(e.headers["x-cakto-signature"], undefined, "signature header not stored");
  }

  // 9. ignored event types are stored, not errors
  r = await sendCakto(caktoId, caktoSecret, "checkout_abandonment", { customerEmail: "x@y.z", createdAt: "2026-06-01T10:00:00Z" });
  assert.equal(r.json.status, "ignored");

  // 10. malformed but authentic payload is kept as failed (never lost)
  r = await sendCakto(caktoId, caktoSecret, "purchase_approved", { ...caktoOrder(randomUUID()), id: undefined });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "failed");

  // 11. custom webhook, HMAC with its own headers
  const customBody = JSON.stringify({
    event_id: `evt-${tag}`,
    order_id: `ord-${tag}`,
    status: "approved",
    occurred_at: "2026-06-01T10:00:00Z",
    gross_amount: 9900,
    products: [{ name: "Custom", unit_amount: 9900 }],
  });
  const ts = String(Math.floor(Date.now() / 1000));
  r = await post("custom", customId, customBody, { "x-webhook-timestamp": ts, "x-webhook-signature": sign(customSecret, ts, customBody) });
  assert.equal(r.json.status, "processed");
  assert.equal((await getOrder(`ord-${tag}`)).gross_amount, 9900);
  r = await post("custom", customId, customBody, { "x-webhook-timestamp": ts, "x-webhook-signature": sign(customSecret, ts, customBody) });
  assert.equal(r.json.duplicate, true);

  // 12. fee engine: rules resolved at sale time and frozen in the order snapshot
  const rule = (over) => ({
    organization_id: org.id, project_id: proj.id, provider: "cakto", percentage: 0, fixed_amount: 0,
    valid_from: "2026-01-01T00:00:00Z", ...over,
  });
  const { data: pixRule } = await db.from("fee_rules").insert(rule({ kind: "gateway_fee", name: "Cakto Pix", payment_method: "pix", percentage: 4.99, fixed_amount: 100 })).select("id").single();
  await db.from("fee_rules").insert(rule({ kind: "gateway_fee", name: "Cakto default", percentage: 9 }));
  await db.from("fee_rules").insert(rule({ kind: "tax", name: "Imposto 6%", provider: null, percentage: 6 }));
  await db.from("fee_rules").insert(rule({ kind: "product_cost", name: "Custo", external_product_id: `prod-${tag}`, fixed_amount: 3500 }));

  const feeOrder = randomUUID();
  r = await sendCakto(caktoId, caktoSecret, "purchase_approved", caktoOrder(feeOrder));
  assert.equal(r.json.status, "processed");
  let fo = await getOrder(feeOrder);
  // 4,99% of 197,00 = 9,83 + 1,00 fixed; tax 6% = 11,82; product cost 35,00
  assert.deepEqual(
    [fo.gateway_fee_amount, fo.tax_amount, fo.product_cost_amount, fo.net_amount, fo.fee_rule_id],
    [1083, 1182, 3500, 19700 - 1083 - 1182, pixRule.id],
    "pix rule (specific) beats the default rule; amounts match the spec formulas",
  );
  assert.equal(fo.fee_snapshot.inputs.feePercentage, 4.99);

  // changing the rate later never touches the old sale
  await db.from("fee_rules").update({ valid_until: new Date().toISOString() }).eq("id", pixRule.id);
  await db.from("fee_rules").insert(rule({ kind: "gateway_fee", name: "Cakto Pix v2", payment_method: "pix", percentage: 5.49, valid_from: new Date(Date.now() + 1000).toISOString().slice(0, 19) + "Z" }));
  fo = await getOrder(feeOrder);
  assert.equal(fo.gateway_fee_amount, 1083, "historical fee frozen");

  // refund reverses revenue and tax; gateway fee stays
  r = await sendCakto(caktoId, caktoSecret, "refund", caktoOrder(feeOrder));
  fo = await getOrder(feeOrder);
  assert.deepEqual([fo.status, fo.tax_amount, fo.net_amount], ["refunded", 0, -1083]);

  console.log("Webhook e2e: all checks passed against", BASE_URL);
} finally {
  if (created.orgId) await db.from("organizations").delete().eq("id", created.orgId);
  if (created.userId) await db.auth.admin.deleteUser(created.userId);
}
