import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateSecret } from "@/lib/crypto";
import { caktoAdapter } from "@/server/adapters/cakto";
import { genericAdapter } from "@/server/adapters/generic";
import { sanitize, toCents } from "@/server/adapters/shared";
import { AdapterError } from "@/server/adapters/types";
import { CAKTO_SECRET, caktoEnvelope, caktoOrder } from "../fixtures/cakto";

const NOW = new Date("2026-06-01T13:02:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));
const sign = (secret: string, timestamp: string, body: string) =>
  `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

describe("toCents", () => {
  it("handles numbers and decimal strings without float drift", () => {
    expect(toCents(197.0, "x")).toBe(19700);
    expect(toCents("10.00", "x")).toBe(1000);
    expect(toCents(0.29, "x")).toBe(29);
    expect(toCents(1.005, "x")).toBe(101);
    expect(toCents(-12.5, "x")).toBe(-1250);
  });
  it("rejects junk", () => {
    expect(() => toCents("abc", "x")).toThrow(AdapterError);
    expect(() => toCents(null, "x")).toThrow(AdapterError);
    expect(() => toCents("", "x")).toThrow(AdapterError);
  });
});

describe("cakto verification", () => {
  const body = JSON.stringify(caktoEnvelope("purchase_approved", caktoOrder()));
  const headers = (h: Record<string, string>) => new Headers(h);

  it("accepts a valid HMAC signature", () => {
    const h = headers({ "x-cakto-timestamp": ts, "x-cakto-signature": sign(CAKTO_SECRET, ts, body) });
    expect(caktoAdapter.verify({ rawBody: body, headers: h, secret: CAKTO_SECRET, now: NOW })).toEqual({ ok: true });
  });
  it("rejects a tampered body", () => {
    const h = headers({ "x-cakto-timestamp": ts, "x-cakto-signature": sign(CAKTO_SECRET, ts, body) });
    const r = caktoAdapter.verify({ rawBody: body + " ", headers: h, secret: CAKTO_SECRET, now: NOW });
    expect(r).toEqual({ ok: false, reason: "invalid_signature" });
  });
  it("rejects a wrong secret", () => {
    const h = headers({ "x-cakto-timestamp": ts, "x-cakto-signature": sign("other", ts, body) });
    expect(caktoAdapter.verify({ rawBody: body, headers: h, secret: CAKTO_SECRET, now: NOW }).ok).toBe(false);
  });
  it("rejects replays outside the 5 minute window", () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 600);
    const h = headers({ "x-cakto-timestamp": old, "x-cakto-signature": sign(CAKTO_SECRET, old, body) });
    expect(caktoAdapter.verify({ rawBody: body, headers: h, secret: CAKTO_SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "timestamp_out_of_tolerance",
    });
  });
  it("falls back to the body secret only when no signature header is sent", () => {
    expect(caktoAdapter.verify({ rawBody: body, headers: headers({}), secret: CAKTO_SECRET, now: NOW }).ok).toBe(true);
    expect(caktoAdapter.verify({ rawBody: body, headers: headers({}), secret: "nope", now: NOW }).ok).toBe(false);
  });
  it("does not fall back when a signature header is present but wrong", () => {
    const h = headers({ "x-cakto-timestamp": ts, "x-cakto-signature": "v1=deadbeef" });
    expect(caktoAdapter.verify({ rawBody: body, headers: h, secret: CAKTO_SECRET, now: NOW }).ok).toBe(false);
  });
});

describe("cakto normalization", () => {
  const parse = (event: string, data: unknown) => caktoAdapter.parse(JSON.stringify(caktoEnvelope(event, data)));

  it("maps purchase_approved to an approved order in cents", () => {
    const r = parse("purchase_approved", caktoOrder());
    if (r.kind !== "events") throw new Error("expected events");
    const e = r.events[0];
    expect(e).toMatchObject({
      provider: "cakto",
      providerEventId: "purchase_approved:b3df956e-1998-4322-b091-ac0c54f7b4ba",
      externalOrderId: "b3df956e-1998-4322-b091-ac0c54f7b4ba",
      status: "approved",
      grossAmount: 19700,
      discountAmount: 0,
      installments: 3,
      paymentMethod: "credit_card",
      currency: "BRL",
    });
    expect(e.customer?.email).toBe("john.doe@example.com");
    expect(e.occurredAt).toBe(new Date("2026-06-01T10:01:30-03:00").toISOString());
    expect(e.tracking).toMatchObject({ utm_source: "fb", utm_campaign: "camp_01", fbp: "fb.1.123.456", refId: "4852F91" });
  });

  it("converts the string-typed discount", () => {
    const r = parse("purchase_approved", caktoOrder({ discount: "10.50" }));
    if (r.kind !== "events") throw new Error("expected events");
    expect(r.events[0].discountAmount).toBe(1050);
  });

  it.each([
    ["pix_gerado", "pending"],
    ["boleto_gerado", "pending"],
    ["purchase_refused", "failed"],
    ["refund", "refunded"],
    ["chargeback", "chargeback"],
  ])("maps %s -> %s", (event, status) => {
    const r = parse(event, caktoOrder());
    if (r.kind !== "events") throw new Error("expected events");
    expect(r.events[0].status).toBe(status);
  });

  it("uses refundedAt / chargedbackAt as the event time", () => {
    const refund = parse("refund", caktoOrder());
    const cb = parse("chargeback", caktoOrder());
    if (refund.kind !== "events" || cb.kind !== "events") throw new Error("expected events");
    expect(refund.events[0].occurredAt).toBe(new Date("2026-06-05T09:00:00-03:00").toISOString());
    expect(cb.events[0].occurredAt).toBe(new Date("2026-06-20T09:00:00-03:00").toISOString());
  });

  it("gives different event ids to different events of the same order (no false duplicates)", () => {
    const a = parse("purchase_approved", caktoOrder());
    const b = parse("refund", caktoOrder());
    if (a.kind !== "events" || b.kind !== "events") throw new Error("expected events");
    expect(a.events[0].providerEventId).not.toBe(b.events[0].providerEventId);
  });

  it("handles Webhook V2 array deliveries", () => {
    const r = parse("purchase_approved", [caktoOrder(), caktoOrder({ id: "bump-1", offer_type: "orderbump", amount: 27.0 })]);
    if (r.kind !== "events") throw new Error("expected events");
    expect(r.events.map((e) => e.grossAmount)).toEqual([19700, 2700]);
    expect(r.deliveryKey).toContain("bump-1");
  });

  it("ignores events without an order or outside scope", () => {
    expect(caktoAdapter.parse(JSON.stringify({ event: "checkout_abandonment", data: { customerEmail: "a@b.c" } })).kind).toBe("ignored");
    expect(parse("refund_requested", caktoOrder()).kind).toBe("ignored");
    expect(parse("subscription_renewed", caktoOrder()).kind).toBe("ignored");
    expect(parse("some_future_event", caktoOrder()).kind).toBe("ignored");
  });

  it("throws on malformed payloads instead of guessing", () => {
    expect(() => caktoAdapter.parse("not json")).toThrow(AdapterError);
    expect(() => parse("purchase_approved", caktoOrder({ id: undefined }))).toThrow(/data.id/);
    expect(() => parse("purchase_approved", caktoOrder({ amount: null, baseAmount: null }))).toThrow(/amount/);
    expect(() => parse("purchase_approved", caktoOrder({ paidAt: "garbage" }))).toThrow(/paidAt/);
  });
});

describe("generic adapter", () => {
  const payload = {
    event_id: "evt_123",
    order_id: "ord_1",
    status: "approved",
    occurred_at: "2026-06-01T10:00:00Z",
    gross_amount: 19700,
    payment_method: "pix",
    customer: { name: "Ana", email: "ANA@x.com" },
    products: [{ id: "p1", name: "Curso", unit_amount: 19700 }],
  };
  const body = JSON.stringify(payload);

  it("verifies the same HMAC scheme with its own headers", () => {
    const h = new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": sign("s3cret", ts, body) });
    expect(genericAdapter.verify({ rawBody: body, headers: h, secret: "s3cret", now: NOW }).ok).toBe(true);
    expect(genericAdapter.verify({ rawBody: body, headers: h, secret: "x", now: NOW }).ok).toBe(false);
    expect(genericAdapter.verify({ rawBody: body, headers: new Headers(), secret: "s3cret", now: NOW }).ok).toBe(false);
  });
  it("normalizes a valid payload", () => {
    const r = genericAdapter.parse(body);
    if (r.kind !== "events") throw new Error("expected events");
    expect(r.events[0]).toMatchObject({ providerEventId: "evt_123", grossAmount: 19700, status: "approved", currency: "BRL" });
    expect(r.events[0].customer?.email).toBe("ana@x.com");
  });
  it("rejects non-integer money and unknown statuses", () => {
    expect(() => genericAdapter.parse(JSON.stringify({ ...payload, gross_amount: 197.5 }))).toThrow(AdapterError);
    expect(() => genericAdapter.parse(JSON.stringify({ ...payload, status: "weird" }))).toThrow(AdapterError);
  });
});

describe("secrets", () => {
  it("sanitize strips credentials deeply, keeps data", () => {
    const out = sanitize({ secret: "x", event: "e", data: { token: "t", amount: 1, nested: [{ password: "p", ok: 1 }] } });
    expect(out).toEqual({ event: "e", data: { amount: 1, nested: [{ ok: 1 }] } });
  });
  it("AES-GCM roundtrip, unique IV, tamper detection", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const a = encryptSecret("hello", key);
    const b = encryptSecret("hello", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("hello");
    const tampered = a.slice(0, -2) + (a.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(generateSecret()).toHaveLength(48);
  });
});
