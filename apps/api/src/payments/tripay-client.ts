import { HttpException } from "@nestjs/common";
import { createHmac } from "node:crypto";

export type PaymentChannel = { code: string; name: string; group: string; minimum_amount: number; maximum_amount: number; fee_customer: { flat: number; percent: number | string }; active: boolean };
export type TripayTransaction = {
  reference: string; merchant_ref: string; payment_method: string; payment_name: string;
  amount: number; fee_customer: number; status: string; checkout_url: string;
  pay_code: string | null; expired_time: number;
  order_items: { sku?: string | null; price: number; quantity: number }[];
};

export function tripayConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.TRIPAY_API_KEY?.trim(), privateKey = env.TRIPAY_PRIVATE_KEY?.trim(), merchant = env.TRIPAY_MERCHANT_CODE?.trim();
  const base = env.TRIPAY_BASE_URL?.trim().replace(/\/$/, "");
  if (!apiKey || !privateKey || !merchant) throw new HttpException("Kredensial Tripay sandbox belum lengkap.", 503);
  // Production needs a separate rollout; sandbox payments must never charge real funds.
  if (base !== "https://tripay.co.id/api-sandbox") throw new HttpException("Integrasi ini hanya mengizinkan Tripay sandbox.", 503);
  return { apiKey, privateKey, merchant, base };
}

export class TripayClient {
  constructor(private readonly transport: typeof fetch = fetch) {}

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const config = tripayConfig();
    try {
      const response = await this.transport(`${config.base}/${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      let size = 0;
      const parts: Uint8Array[] = [];
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1024 * 1024) { await reader.cancel(); throw new Error("Response too large"); }
        parts.push(part.value);
      }
      const result = JSON.parse(Buffer.concat(parts).toString("utf8")) as { success?: unknown; data?: T };
      if (!response.ok || result.success !== true || !result.data) throw new Error("Provider rejected request");
      return result.data;
    } catch {
      // Never echo provider payloads, credentials, customer details or fetch errors.
      throw new HttpException("Tripay sandbox tidak dapat dihubungi atau menolak permintaan. Periksa konfigurasi dan channel merchant.", 502);
    }
  }

  async channels(): Promise<PaymentChannel[]> {
    const data = await this.request<PaymentChannel[]>("merchant/payment-channel");
    if (!Array.isArray(data)) throw new HttpException("Respons channel Tripay tidak valid.", 502);
    return data.filter(channel => channel.active === true && /^[A-Z0-9_]{1,50}$/.test(channel.code));
  }

  async create(input: { id: string; method: string; amount: number; name: string; email: string; phone: string; product: string; code: string; callback: string; returnUrl: string }) {
    const { privateKey, merchant } = tripayConfig();
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new HttpException("Nominal tidak valid.", 400);
    return this.request<TripayTransaction>("transaction/create", {
      method: input.method, merchant_ref: input.id, amount: input.amount,
      customer_name: input.name, customer_email: input.email, customer_phone: input.phone,
      order_items: [{ sku: input.code, name: input.product, price: input.amount, quantity: 1 }],
      callback_url: input.callback, return_url: input.returnUrl,
      signature: createHmac("sha256", privateKey).update(merchant + input.id + input.amount).digest("hex"),
    });
  }

  detail(reference: string) {
    return this.request<TripayTransaction>(`transaction/detail?reference=${encodeURIComponent(reference)}`);
  }

  async findByMerchantRef(id: string): Promise<string | null> {
    const data = await this.request<{ reference: string; merchant_ref: string }[]>(`merchant/transactions?merchant_ref=${encodeURIComponent(id)}&per_page=2&sort=desc`);
    if (!Array.isArray(data) || data.length > 1 || data.some(item => item.merchant_ref !== id || typeof item.reference !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(item.reference))) throw new HttpException("Referensi pembayaran perlu diperiksa manual.", 409);
    return data[0]?.reference ?? null;
  }
}
