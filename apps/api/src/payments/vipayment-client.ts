import { createHash } from "node:crypto";

export type VipOrder = { category: "game" | "prepaid" | "apps" | "social"; provider_code: string; target: string; target_zone: string | null; provider_cost: number; provider_reference: string | null; service_quantity?: number };
export type VipResult = { reference: string; status: "processing" | "completed" | "failed" | "manual_review"; note: string };

/** No automatic retry: VIPayment does not document an order idempotency key. */
export class VipaymentClient {
  private async request(category: VipOrder["category"], fields: Record<string, string>): Promise<unknown> {
    const id = process.env.VIPAYMENT_API_ID?.trim(), key = process.env.VIPAYMENT_API_KEY?.trim();
    if (!id || !key) throw new Error("VIPayment configuration unavailable");
    const response = await fetch(`https://vip-reseller.co.id/api/${category === "prepaid" ? "prepaid" : category === "social" ? "social-media" : "game-feature"}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, key, sign: createHash("md5").update(id + key).digest("hex") }),
    });
    if (!response.ok || !response.body) throw new Error("VIPayment response unavailable");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) throw new Error("VIPayment response too large"); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("VIPayment response invalid"); }
  }
  async order(order: VipOrder): Promise<VipResult> {
    if (process.env.VIPAYMENT_FULFILLMENT_ENABLED !== "true") throw new Error("Live fulfillment disabled");
    this.validate(order);
    const fields: Record<string,string> = order.category === "social"
      ? { type: "order", service: order.provider_code, data: order.target, quantity: String(order.service_quantity) }
      : { type: "order", service: order.provider_code, data_no: order.target, ...(order.target_zone ? { data_zone: order.target_zone } : {}) };
    const result = await this.request(order.category, fields);
    return this.parse(result, order, false);
  }
  async status(order: VipOrder): Promise<VipResult> {
    this.validate(order);
    if (!order.provider_reference || !/^[a-zA-Z0-9_-]{1,100}$/.test(order.provider_reference)) throw new Error("Missing provider reference");
    return this.parse(await this.request(order.category, { type: "status", trxid: order.provider_reference }), order, true);
  }
  private validate(order: VipOrder) {
    if (order.category === "social" && (!Number.isSafeInteger(order.service_quantity) || order.service_quantity! < 1 || order.service_quantity! > 10000000 || order.target_zone)) throw new Error("Invalid social quantity");
    if (!["game", "prepaid", "apps", "social"].includes(order.category) || !order.provider_code || !order.target || order.target.length > 200 || /[\u0000-\u001f]/.test(order.target) || !Number.isSafeInteger(order.provider_cost) || order.provider_cost <= 0 || (order.category === "prepaid" && order.target_zone)) throw new Error("Invalid fulfillment destination");
  }
  private parse(value: unknown, order: VipOrder, status: boolean): VipResult {
    const result = value as { result?: unknown; data?: unknown } | null;
    if (!result || result.result !== true) throw new Error("VIPayment result unconfirmed");
    const rows = status ? result.data : [result.data];
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Ambiguous VIPayment result");
    const row = rows[0] as Record<string, unknown> | null;
    if (!row || typeof row.trxid !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.trxid) || (order.provider_reference && row.trxid !== order.provider_reference) || (order.category === "social" && row.quantity !== order.service_quantity) || row.data !== order.target || String(row.zone ?? "") !== (order.target_zone ?? "") || (order.category === "prepaid" && row.code !== order.provider_code) || row.price !== order.provider_cost || !["waiting", "processing", "success", "error", ...(order.category === "social" ? ["partial"] : [])].includes(String(row.status)) || typeof row.note !== "string" || row.note.length > 4000) throw new Error("VIPayment result does not match order");
    return { reference: row.trxid, status: row.status === "partial" ? "manual_review" : row.status === "success" ? "completed" : row.status === "error" ? "failed" : "processing", note: row.note };
  }
}
