import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { PaymentStore } from "./payment-store";
import { VipaymentClient, type VipOrder } from "./vipayment-client";

type Order = VipOrder & { id: string; payment_status: string; fulfillment_status: string; payment_reference: string | null };

/** Dispatch only verified, paid production orders through an atomic claim. */
@Injectable()
export class FulfillmentWorker implements OnModuleInit, OnModuleDestroy {
  private store = new PaymentStore();
  private provider = new VipaymentClient();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  onModuleInit() {
    this.timer = setInterval(() => { void this.run().catch(() => console.warn("fulfillment.reconciliation_unavailable")); }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      if (process.env.VIPAYMENT_STATUS_POLLING_ENABLED === "false") return;
      // A crash after claiming may have sent the order. Never reclaim it for sending.
      await this.store.request("live_transactions?payment_mode=eq.live&fulfillment_status=eq.dispatching&updated_at=lt." + encodeURIComponent(new Date(Date.now() - 120000).toISOString()), "PATCH", { fulfillment_status: "unknown", updated_at: new Date().toISOString() });
      const states = process.env.VIPAYMENT_FULFILLMENT_ENABLED === "true" ? "in.(ready,processing)" : "eq.processing";
      const rows = await this.store.request<Order[]>(`live_transactions?payment_mode=eq.live&fulfillment_mode=eq.vipayment&review_required=eq.false&payment_status=eq.paid&fulfillment_status=${states}&order=updated_at.asc&limit=20`);
      for (const row of rows) {
        try { await this.process(row); } catch { console.warn("fulfillment.order_requires_check"); }
      }
    } finally { this.running = false; }
  }
  private async process(row: Order) {
    if (row.fulfillment_status === "ready") {
      if (process.env.VIPAYMENT_FULFILLMENT_ENABLED !== "true") return;
      const [claimed] = await this.store.request<Order[]>("rpc/claim_live_fulfillment", "POST", { p_id: row.id });
      if (!claimed) return;
      try {
        const result = await this.provider.order(claimed);
        await this.save(claimed, result.status, result.reference, result.note);
      } catch {
        await this.save(claimed, "unknown", null, null);
      }
    } else if (row.fulfillment_status === "processing") {
      const result = await this.provider.status(row);
      await this.save(row, result.status, result.reference, result.note);
    }
  }
  private async save(row: Order, status: string, reference: string | null, note: string | null) {
    // Compare state so a delayed poll cannot overwrite a terminal result/refund.
    const updated = await this.store.request<Order[]>(`live_transactions?id=eq.${row.id}&payment_status=eq.paid&fulfillment_status=eq.${row.fulfillment_status}`, "PATCH", {
      fulfillment_status: status, ...(reference ? { provider_reference: reference } : {}), ...(note !== null ? { provider_note: note } : {}), updated_at: new Date().toISOString(),
    });
    if (!updated.length) throw new Error("Fulfillment state changed; manual reconciliation required");
  }
}
