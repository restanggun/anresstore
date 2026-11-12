export type PaymentStatus = "creating" | "pending" | "paid" | "failed" | "expired" | "refunded" | "unknown";
export type FulfillmentStatus = "not_ready" | "ready" | "dispatching" | "processing" | "completed" | "failed" | "unknown" | "manual_review";
export type TransactionState = { payment: PaymentStatus; fulfillment: FulfillmentStatus };
export type PaymentEvent = "PAID" | "FAILED" | "EXPIRED" | "REFUND";

/** Applies a verified provider event. Conflicts require review, never another dispatch. */
export function applyPaymentEvent(state: TransactionState, event: PaymentEvent): { state: TransactionState; outcome: "changed" | "duplicate" | "review" } {
  const next: Record<PaymentEvent, PaymentStatus> = { PAID: "paid", FAILED: "failed", EXPIRED: "expired", REFUND: "refunded" };
  const status = next[event];
  if (state.payment === status) return { state, outcome: "duplicate" };
  if (event === "REFUND" && state.payment === "paid") return { state: { ...state, payment: "refunded", fulfillment: state.fulfillment === "ready" ? "manual_review" : state.fulfillment }, outcome: "changed" };
  if (state.payment === "creating" || state.payment === "pending" || state.payment === "unknown") {
    if (event === "REFUND") return { state, outcome: "review" };
    return { state: { payment: status, fulfillment: event === "PAID" ? "ready" : "not_ready" }, outcome: "changed" };
  }
  // Late or contradictory events require reconciliation, not a state rollback.
  return { state, outcome: "review" };
}

/** After sending an order, any unconfirmed result must not be retried automatically. */
export function applyDispatchResult(state: TransactionState, result: "accepted" | "rejected" | "uncertain"): TransactionState {
  if (state.payment !== "paid" || state.fulfillment !== "dispatching") throw new Error("Invalid fulfillment transition");
  return { ...state, fulfillment: result === "accepted" ? "processing" : result === "rejected" ? "failed" : "unknown" };
}
