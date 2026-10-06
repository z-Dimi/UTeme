import type { OrderStatus } from "@/lib/finance/order-state";
import { isoDate, normalizeEmail, safeEqual, str, toCents, verifyHmacV1 } from "./shared";
import {
  AdapterError,
  type NormalizedOrderEvent,
  type ParseResult,
  type PaymentProviderAdapter,
  type VerifyInput,
  type VerifyResult,
} from "./types";

/**
 * Cakto webhooks. Contract: https://docs.cakto.com.br/conceitos/webhooks
 * Envelope { secret, event, data }; `data` is an order object (or an array of them in Webhook V2).
 * Signature: X-Cakto-Signature "v1=<hmac-sha256>" over "{X-Cakto-Timestamp}.{raw body}".
 */
const EVENT_STATUS: Record<string, { status: OrderStatus; dateField: string }> = {
  purchase_approved: { status: "approved", dateField: "paidAt" },
  pix_gerado: { status: "pending", dateField: "createdAt" },
  boleto_gerado: { status: "pending", dateField: "createdAt" },
  picpay_gerado: { status: "pending", dateField: "createdAt" },
  openfinance_nubank_gerado: { status: "pending", dateField: "createdAt" },
  purchase_refused: { status: "failed", dateField: "createdAt" },
  refund: { status: "refunded", dateField: "refundedAt" },
  chargeback: { status: "chargeback", dateField: "chargedbackAt" },
};

/** Known events that carry no order-status change we model yet. */
const IGNORED_EVENTS: Record<string, string> = {
  initiate_checkout: "checkout event, no order",
  checkout_abandonment: "checkout abandonment, no order",
  refund_requested: "refund requested; order stays paid until the refund event",
  subscription_created: "subscription events are not supported yet",
  subscription_canceled: "subscription events are not supported yet",
  subscription_renewed: "subscription events are not supported yet",
  subscription_renewal_refused: "subscription events are not supported yet",
  subscription_paused: "subscription events are not supported yet",
  subscription_resumed: "subscription events are not supported yet",
  subscription_late: "subscription events are not supported yet",
  subscription_late_recovered: "subscription events are not supported yet",
};

const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "sck", "fbc", "fbp"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function normalizeOrder(event: string, data: Obj, mapping: (typeof EVENT_STATUS)[string]): NormalizedOrderEvent {
  const id = str(data.id);
  if (!id) throw new AdapterError("data.id is missing");

  const gross = data.amount ?? data.baseAmount;
  if (gross === null || gross === undefined) throw new AdapterError("data.amount/baseAmount is missing");

  const occurredRaw = data[mapping.dateField] ?? data.createdAt;
  const customer = isObj(data.customer) ? data.customer : {};
  const product = isObj(data.product) ? data.product : {};
  const grossAmount = toCents(gross, "data.amount");

  const tracking: Record<string, string> = {};
  for (const k of TRACKING_KEYS) {
    const v = str(data[k]);
    if (v) tracking[k] = v;
  }
  for (const k of ["refId", "offer_type", "parent_order"] as const) {
    const v = str(data[k]);
    if (v) tracking[k] = v;
  }

  return {
    provider: "cakto",
    providerEventId: `${event}:${id}`,
    externalOrderId: id,
    eventType: event,
    status: mapping.status,
    paymentMethod: str(data.paymentMethod),
    installments: typeof data.installments === "number" ? data.installments : undefined,
    currency: str(isObj(data.offer) ? data.offer.currency : undefined) ?? "BRL",
    grossAmount,
    discountAmount: data.discount == null ? 0 : toCents(data.discount, "data.discount"),
    customer: {
      name: str(customer.name),
      email: normalizeEmail(customer.email),
      phone: str(customer.phone),
      document: str(customer.docNumber),
    },
    products: [
      {
        id: str(product.id),
        name: str(product.name) ?? "Produto",
        quantity: 1,
        unitAmount: grossAmount,
      },
    ],
    tracking,
    occurredAt: isoDate(occurredRaw, `data.${mapping.dateField}`),
  };
}

export const caktoAdapter: PaymentProviderAdapter = {
  provider: "cakto",

  verify({ rawBody, headers, secret, now }: VerifyInput): VerifyResult {
    const signature = headers.get("x-cakto-signature");
    if (signature) {
      // When a signature is present it must be valid: never fall back to the weaker check.
      return verifyHmacV1({ rawBody, timestamp: headers.get("x-cakto-timestamp"), signature, secret, now });
    }
    // Legacy check: shared secret inside the body (HTTPS only).
    try {
      const body = JSON.parse(rawBody) as Obj;
      return typeof body.secret === "string" && safeEqual(body.secret, secret)
        ? { ok: true }
        : { ok: false, reason: "invalid_secret" };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  },

  parse(rawBody: string): ParseResult {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new AdapterError("Body is not valid JSON");
    }
    if (!isObj(body) || typeof body.event !== "string") throw new AdapterError("Envelope without `event`");
    const event = body.event;

    if (event in IGNORED_EVENTS) return { kind: "ignored", reason: IGNORED_EVENTS[event], eventType: event };
    const mapping = EVENT_STATUS[event];
    if (!mapping) return { kind: "ignored", reason: `unknown event "${event}"`, eventType: event };

    // Webhook V2 sends an array of orders (main + bump + upsell) in one delivery.
    const items = Array.isArray(body.data) ? body.data : [body.data];
    if (items.length === 0 || !items.every(isObj)) throw new AdapterError("`data` is not an order object");

    const events = items.map((d) => normalizeOrder(event, d, mapping));
    return { kind: "events", deliveryKey: events.map((e) => e.providerEventId).join("|"), events };
  },
};
