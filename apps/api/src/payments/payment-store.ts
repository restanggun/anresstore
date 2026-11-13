import { HttpException } from "@nestjs/common";

/** Service-role transport. Responses and request bodies never enter error messages. */
export class PaymentStore {
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) throw new HttpException("Penyimpanan pembayaran belum dikonfigurasi.", 503);
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json", Prefer: "return=representation" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 409) throw new HttpException("ID pembayaran sudah digunakan untuk permintaan lain.", 409);
      if (!response.ok) throw new Error();
      return await response.json() as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException("Penyimpanan pembayaran tidak tersedia. Coba periksa status sebelum membuat pesanan baru.", 503);
    }
  }

  rpc<T>(name: "consume_payment_rate" | "reserve_sandbox_payment" | "claim_sandbox_payment_check", body: unknown) {
    return this.request<T>(`rpc/${name}`, "POST", body);
  }
}
