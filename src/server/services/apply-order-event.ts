import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateNetRevenue, type PeriodTotals } from "@/lib/finance";
import { resolveTransition, type OrderStatus } from "@/lib/finance/order-state";
import type { NormalizedOrderEvent } from "@/server/adapters/types";
import { computeOrderFinancials, loadRules } from "./fee-rules";

export type Scope = { organizationId: string; projectId: string; integrationId: string };
export type ApplyResult = { result: "applied" | "noop" | "rejected"; orderId: string; from: OrderStatus | null; to: OrderStatus };

type OrderRow = {
  id: string;
  status: OrderStatus;
  gross_amount: number;
  gateway_fee_amount: number;
  tax_amount: number;
};

const MAX_CAS_ATTEMPTS = 3;

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}${error?.code ? ` (${error.code})` : ""}`);
}

function netAmount(row: { gross: number; fee: number; tax: number; refund: number; chargeback: number }) {
  const totals: PeriodTotals = {
    grossRevenue: row.gross,
    refunds: row.refund,
    chargebacks: row.chargeback,
    gatewayFees: row.fee,
    taxes: row.tax,
    productCosts: 0,
    adSpend: 0,
    metaAdsTax: 0,
    expenses: 0,
  };
  return calculateNetRevenue(totals);
}

/**
 * Columns that depend on the target status. Refunds/chargebacks are full-amount (gateways send no
 * partials we model). Revenue tax is reversed with the revenue; the gateway fee is not (gateways
 * normally keep it). The original tax stays in fee_snapshot for audit.
 */
function statusColumns(order: { gross: number; fee: number; tax: number }, status: OrderStatus, occurredAt: string) {
  const refund = status === "refunded" ? order.gross : 0;
  const chargeback = status === "chargeback" ? order.gross : 0;
  const tax = refund > 0 || chargeback > 0 ? 0 : order.tax;
  return {
    status,
    refund_amount: refund,
    chargeback_amount: chargeback,
    tax_amount: tax,
    net_amount: netAmount({ ...order, tax, refund, chargeback }),
    ...(status === "approved" ? { approved_at: occurredAt } : {}),
    ...(status === "refunded" ? { refunded_at: occurredAt } : {}),
    ...(status === "chargeback" ? { chargeback_at: occurredAt } : {}),
  };
}

async function upsertCustomer(db: SupabaseClient, scope: Scope, event: NormalizedOrderEvent) {
  const c = event.customer;
  if (!c?.email) return null;
  const { data, error } = await db
    .from("customers")
    .upsert(
      {
        organization_id: scope.organizationId,
        project_id: scope.projectId,
        email: c.email,
        name: c.name ?? null,
        phone: c.phone ?? null,
        document: c.document ?? null,
      },
      { onConflict: "project_id,email" },
    )
    .select("id")
    .single();
  if (error) fail("upsert customer", error);
  return data.id as string;
}

async function upsertProducts(db: SupabaseClient, scope: Scope, event: NormalizedOrderEvent) {
  const ids = new Map<string, string>();
  for (const p of event.products) {
    if (!p.id) continue;
    const { data, error } = await db
      .from("products")
      .upsert(
        {
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          provider: event.provider,
          external_id: p.id,
          name: p.name,
        },
        { onConflict: "project_id,provider,external_id" },
      )
      .select("id")
      .single();
    if (error) fail("upsert product", error);
    ids.set(p.id, data.id as string);
  }
  return ids;
}

async function findOrder(db: SupabaseClient, scope: Scope, event: NormalizedOrderEvent): Promise<OrderRow | null> {
  const { data, error } = await db
    .from("orders")
    .select("id, status, gross_amount, gateway_fee_amount, tax_amount")
    .eq("project_id", scope.projectId)
    .eq("provider", event.provider)
    .eq("external_order_id", event.externalOrderId)
    .maybeSingle();
  if (error) fail("find order", error);
  return data as OrderRow | null;
}

async function recordEvent(
  db: SupabaseClient,
  scope: Scope,
  orderId: string,
  webhookEventId: string,
  event: NormalizedOrderEvent,
  result: ApplyResult["result"],
  from: OrderStatus | null,
) {
  const { error } = await db.from("order_events").insert({
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    order_id: orderId,
    webhook_event_id: webhookEventId,
    event_type: event.eventType,
    from_status: from,
    to_status: event.status,
    result,
    amount: event.grossAmount,
    occurred_at: event.occurredAt,
  });
  if (error) fail("record order event", error);
}

/**
 * Applies one normalized event to the order ledger.
 * Idempotent: replaying an event is a no-op, and a late event can never regress an order
 * (state machine + compare-and-set on the previous status).
 */
export async function applyOrderEvent(
  db: SupabaseClient,
  scope: Scope,
  event: NormalizedOrderEvent,
  webhookEventId: string,
): Promise<ApplyResult> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const existing = await findOrder(db, scope, event);

    if (!existing) {
      const [customerId, productIds] = await Promise.all([
        upsertCustomer(db, scope, event),
        upsertProducts(db, scope, event),
      ]);
      const fin = computeOrderFinancials(await loadRules(db, scope.projectId), event);
      const base = { gross: event.grossAmount, fee: fin.gatewayFeeAmount, tax: fin.taxAmount };
      const { data, error } = await db
        .from("orders")
        .insert({
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          integration_id: scope.integrationId,
          provider: event.provider,
          external_order_id: event.externalOrderId,
          payment_method: event.paymentMethod ?? null,
          installments: event.installments ?? null,
          currency: event.currency,
          gross_amount: event.grossAmount,
          discount_amount: event.discountAmount,
          customer_id: customerId,
          gateway_fee_amount: fin.gatewayFeeAmount,
          product_cost_amount: fin.productCostAmount,
          fee_rule_id: fin.feeRuleId,
          fee_snapshot: fin.snapshot,
          tracking: event.tracking,
          ordered_at: event.occurredAt,
          raw_source: event.provider,
          ...statusColumns(base, event.status, event.occurredAt),
        })
        .select("id")
        .single();

      if (error?.code === "23505") continue; // concurrent delivery created it first; re-read and transition.
      if (error) fail("insert order", error);

      const orderId = data.id as string;
      const { error: itemsError } = await db.from("order_items").insert(
        event.products.map((p) => ({
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          order_id: orderId,
          product_id: p.id ? (productIds.get(p.id) ?? null) : null,
          name: p.name,
          quantity: p.quantity,
          unit_amount: p.unitAmount,
        })),
      );
      if (itemsError) fail("insert order items", itemsError);

      await recordEvent(db, scope, orderId, webhookEventId, event, "applied", null);
      return { result: "applied", orderId, from: null, to: event.status };
    }

    const decision = resolveTransition(existing.status, event.status);
    if (decision.kind !== "apply") {
      const result = decision.kind === "noop" ? "noop" : "rejected";
      await recordEvent(db, scope, existing.id, webhookEventId, event, result, existing.status);
      return { result, orderId: existing.id, from: existing.status, to: event.status };
    }

    // Financials are (re)resolved when the sale becomes approved, using the approval instant and the
    // final payment method; from then on they are frozen. Later refunds only reverse revenue.
    let frozen: Record<string, unknown> = {};
    let money = { gross: existing.gross_amount, fee: existing.gateway_fee_amount, tax: existing.tax_amount };
    if (decision.to === "approved") {
      const fin = computeOrderFinancials(await loadRules(db, scope.projectId), event);
      money = { gross: event.grossAmount, fee: fin.gatewayFeeAmount, tax: fin.taxAmount };
      frozen = {
        gross_amount: event.grossAmount,
        payment_method: event.paymentMethod ?? null,
        installments: event.installments ?? null,
        gateway_fee_amount: fin.gatewayFeeAmount,
        product_cost_amount: fin.productCostAmount,
        fee_rule_id: fin.feeRuleId,
        fee_snapshot: fin.snapshot,
      };
    }
    const cols = { ...frozen, ...statusColumns(money, decision.to, event.occurredAt) };
    const { data: updated, error } = await db
      .from("orders")
      .update(cols)
      .eq("id", existing.id)
      .eq("status", existing.status) // compare-and-set: lose gracefully to a concurrent writer
      .select("id");
    if (error) fail("update order", error);
    if (!updated || updated.length === 0) continue;

    await recordEvent(db, scope, existing.id, webhookEventId, event, "applied", existing.status);
    return { result: "applied", orderId: existing.id, from: existing.status, to: decision.to };
  }
  throw new Error("applyOrderEvent: too much contention, giving up after retries");
}
