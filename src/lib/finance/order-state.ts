export type OrderStatus =
  | "pending"
  | "approved"
  | "refunded"
  | "chargeback"
  | "cancelled"
  | "failed";

/**
 * Status precedence. A late webhook may never move an order backwards
 * (e.g. refunded -> pending). Same-status events are idempotent no-ops.
 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: ["approved", "cancelled", "failed"],
  approved: ["refunded", "chargeback"],
  refunded: [],
  chargeback: [],
  cancelled: [],
  // A retried payment can succeed after a failure.
  failed: ["pending", "approved"],
};

export type TransitionResult =
  | { kind: "apply"; to: OrderStatus }
  | { kind: "noop"; reason: "same_status" }
  | { kind: "reject"; reason: "regression" };

export function resolveTransition(from: OrderStatus, to: OrderStatus): TransitionResult {
  if (from === to) return { kind: "noop", reason: "same_status" };
  return ALLOWED[from].includes(to)
    ? { kind: "apply", to }
    : { kind: "reject", reason: "regression" };
}
