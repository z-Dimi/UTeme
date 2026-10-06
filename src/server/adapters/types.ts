import type { OrderStatus } from "@/lib/finance/order-state";

export type NormalizedOrderEvent = {
  provider: string;
  /** Unique per provider event (idempotency key). */
  providerEventId: string;
  externalOrderId: string;
  /** Provider's own event name, kept for the audit trail. */
  eventType: string;
  status: OrderStatus;
  paymentMethod?: string;
  installments?: number;
  currency: string;
  /** Integer cents. */
  grossAmount: number;
  discountAmount: number;
  customer?: { name?: string; email?: string; phone?: string; document?: string };
  products: Array<{ id?: string; name: string; quantity: number; unitAmount: number }>;
  /** Hints sent by the gateway (utm_*, sck, fbc, fbp...). Never used to infer attribution. */
  tracking: Record<string, string>;
  /** ISO 8601. */
  occurredAt: string;
};

export type ParseResult =
  | {
      kind: "events";
      /** Stable key for the whole delivery, used to dedupe re-deliveries. */
      deliveryKey: string;
      events: NormalizedOrderEvent[];
    }
  | { kind: "ignored"; reason: string; eventType?: string; deliveryKey?: string };

export type VerifyInput = {
  rawBody: string;
  headers: Headers;
  secret: string;
  now?: Date;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Adapters validate and normalize only. No business rules, no database. */
export interface PaymentProviderAdapter {
  readonly provider: "cakto" | "custom";
  verify(input: VerifyInput): VerifyResult;
  /** Throws AdapterError when the payload is malformed. */
  parse(rawBody: string): ParseResult;
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}
