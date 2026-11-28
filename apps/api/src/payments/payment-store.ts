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
      if (response.status === 409) throw new HttpException("Data pesanan atau katalog telah berubah. Muat ulang katalog dan periksa invoice sebelum mencoba lagi.", 409);
      if (!response.ok) throw new Error();
      return await response.json() as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException("Penyimpanan pembayaran tidak tersedia. Coba periksa status sebelum membuat pesanan baru.", 503);
    }
  }

  rpc<T>(name: "consume_payment_rate" | "reserve_payment" | "reserve_task_payment" | "quote_task_order" | "claim_payment_check" |
    "voucher_offer" | "account_vouchers" | "reserve_voucher_payment" | "reserve_premium_voucher" |
    "voucher_set_account" | "voucher_admin_accounts" | "voucher_admin_usage" |
    "voucher_admin_redemptions" | "voucher_release_premium" | "campaign_user_snapshot" |
    "capture_referral_attribution" | "activate_referral_attribution" | "review_referral" |
    "reseller_progress" | "submit_reseller" | "reserve_reseller_payment" | "claim_retail_tier" |
    "reserve_hosted_reseller_payment" | "record_reseller_payout" | "record_reseller_adjustment", body: unknown) {
    return this.request<T>(`rpc/${name}`, "POST", body);
  }

  async voucherReceipt(column: "payment_id" | "premium_id", id: string) {
    const [row] = await this.request<{ voucher_name: string; base_amount: number; discount: number }[]>(
      `voucher_redemptions?${column}=eq.${id}&select=voucher_name,base_amount,discount&limit=1`);
    return row ? { name: row.voucher_name, baseAmount: row.base_amount, discount: row.discount } : null;
  }
}
