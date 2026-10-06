/**
 * Cakto payloads built from the field contract in https://docs.cakto.com.br/conceitos/webhooks
 * (values are fictitious). `fees`/`amount`/`baseAmount` are JSON numbers; `discount` is a string.
 */
export const CAKTO_SECRET = "b3f1a9c2-7b4d-4a8e-9f01-2c6d5b8a4e37";

export function caktoOrder(over: Record<string, unknown> = {}) {
  return {
    id: "b3df956e-1998-4322-b091-ac0c54f7b4ba",
    refId: "4852F91",
    status: "paid",
    offer_type: "main",
    baseAmount: 197.0,
    amount: 197.0,
    fees: 14.3,
    discount: "0.00",
    installments: 3,
    paymentMethod: "credit_card",
    customer: {
      id: 481920,
      name: "John Doe",
      email: "  John.Doe@Example.com ",
      phone: "5534999999999",
      docType: "cpf",
      docNumber: "12345678909",
    },
    product: { id: "cd287b31-d4b7-4e94-858a-96e05ce2f4a2", short_id: "42bruPi", name: "Produto Teste", type: "unique" },
    offer: { id: "a8BcHrY", name: "Special Offer", price: 197.0, currency: "BRL" },
    utm_source: "fb",
    utm_campaign: "camp_01",
    fbp: "fb.1.123.456",
    createdAt: "2026-06-01T10:00:00.000000-03:00",
    paidAt: "2026-06-01T10:01:30.000000-03:00",
    refundedAt: "2026-06-05T09:00:00.000000-03:00",
    chargedbackAt: "2026-06-20T09:00:00.000000-03:00",
    ...over,
  };
}

export const caktoEnvelope = (event: string, data: unknown) => ({ secret: CAKTO_SECRET, event, data });
