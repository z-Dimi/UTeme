import { z } from "zod";
import { isoDate, normalizeEmail, verifyHmacV1 } from "./shared";
import {
  AdapterError,
  type NormalizedOrderEvent,
  type ParseResult,
  type PaymentProviderAdapter,
  type VerifyInput,
  type VerifyResult,
} from "./types";

/**
 * Custom webhook (our own documented format, see docs/WEBHOOKS.md).
 * Auth: X-Webhook-Timestamp + X-Webhook-Signature "v1=<hmac-sha256(secret, '{ts}.{body}')>".
 * Money is integer cents.
 */
const schema = z.object({
  event_id: z.string().trim().min(1),
  order_id: z.string().trim().min(1),
  status: z.enum(["pending", "approved", "refunded", "chargeback", "cancelled", "failed"]),
  occurred_at: z.string(),
  currency: z.string().length(3).default("BRL"),
  gross_amount: z.number().int().nonnegative(),
  discount_amount: z.number().int().nonnegative().default(0),
  payment_method: z.string().optional(),
  installments: z.number().int().positive().optional(),
  customer: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      document: z.string().optional(),
    })
    .optional(),
  products: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        quantity: z.number().int().positive().default(1),
        unit_amount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  tracking: z.record(z.string(), z.string()).default({}),
});

export const genericAdapter: PaymentProviderAdapter = {
  provider: "custom",

  verify({ rawBody, headers, secret, now }: VerifyInput): VerifyResult {
    return verifyHmacV1({
      rawBody,
      timestamp: headers.get("x-webhook-timestamp"),
      signature: headers.get("x-webhook-signature"),
      secret,
      now,
    });
  },

  parse(rawBody: string): ParseResult {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new AdapterError("Body is not valid JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AdapterError(`Invalid payload at ${issue.path.join(".") || "root"}: ${issue.message}`);
    }
    const p = parsed.data;
    const event: NormalizedOrderEvent = {
      provider: "custom",
      providerEventId: p.event_id,
      externalOrderId: p.order_id,
      eventType: `order.${p.status}`,
      status: p.status,
      paymentMethod: p.payment_method,
      installments: p.installments,
      currency: p.currency.toUpperCase(),
      grossAmount: p.gross_amount,
      discountAmount: p.discount_amount,
      customer: p.customer && {
        name: p.customer.name,
        email: normalizeEmail(p.customer.email),
        phone: p.customer.phone,
        document: p.customer.document,
      },
      products: p.products.map((x) => ({ id: x.id, name: x.name, quantity: x.quantity, unitAmount: x.unit_amount })),
      tracking: p.tracking,
      occurredAt: isoDate(p.occurred_at, "occurred_at"),
    };
    return { kind: "events", deliveryKey: p.event_id, events: [event] };
  },
};
