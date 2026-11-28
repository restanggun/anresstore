import { HttpException } from "@nestjs/common";
import type { CatalogItem } from "../catalog/catalog-mapping";
import { PaymentStore } from "./payment-store";

export type ResellerTier = "starter" | "pro" | "partner";
export type ResellerMember = {
  user_id: string; shop_name: string; whatsapp: string;
  status: "pending" | "approved" | "rejected" | "suspended"; revision: number;
};
export type ResellerProgress = {
  retailSpend: number; retailTier: "reguler" | "perak" | "emas";
  volume: number; activationSpend: number; activated: boolean; tier: ResellerTier;
};
export type ResellerPrice = Record<ResellerTier, number> & { category: string; code: string };
export type ResellerLink = { id: string; reseller_id: string; category: "game" | "prepaid"; code: string; expires_at: string; payment_id: string | null };

export function resellerAmount(item: CatalogItem, row: ResellerPrice | undefined, tier: ResellerTier) {
  const amount = row?.[tier];
  if (!amount || (item.fulfillmentMode ?? (item.code.startsWith("managed.") ? "manual" : "vipayment")) !== "vipayment" ||
    !Number.isSafeInteger(item.providerCost) ||
    amount <= Number(item.providerCost) || amount > item.price) return null;
  return amount;
}

export class ResellerProgram {
  private readonly store = new PaymentStore();

  async registrationOpen() {
    const [settings] = await this.store.request<{ registration_open: boolean }[]>("reseller_settings?id=eq.1&select=registration_open");
    return settings?.registration_open === true;
  }

  async member(userId: string) {
    const [row] = await this.store.request<ResellerMember[]>(`resellers?user_id=eq.${encodeURIComponent(userId)}&select=user_id,shop_name,whatsapp,status,revision`);
    return row ?? null;
  }

  progress(userId: string) {
    return this.store.rpc<ResellerProgress>("reseller_progress", { p_user: userId });
  }

  async access(userId: string, active = false) {
    const [member, progress] = await Promise.all([this.member(userId), this.progress(userId)]);
    if (member?.status !== "approved" || (active && !progress.activated)) throw new HttpException("Akses reseller belum aktif.", 403);
    return { member, progress };
  }

  async prices(category: string) {
    const rows: ResellerPrice[] = [];
    const query = `reseller_prices?category=eq.${encodeURIComponent(category)}&select=category,code,starter,pro,partner&order=code&limit=500`;
    for (let offset = 0; ; offset += 500) {
      const page = await this.store.request<ResellerPrice[]>(`${query}&offset=${offset}`);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }

  async price(category: string, code: string) {
    const [row] = await this.store.request<ResellerPrice[]>(`reseller_prices?category=eq.${encodeURIComponent(category)}&code=eq.${encodeURIComponent(code)}&select=category,code,starter,pro,partner`);
    return row;
  }

  async hostedPercent() {
    const [settings] = await this.store.request<{ hosted_commission_percent: number }[]>("reseller_settings?id=eq.1&select=hosted_commission_percent");
    return settings?.hosted_commission_percent ?? 0;
  }

  async checkoutLink(id: string) {
    const [row] = await this.store.request<ResellerLink[]>(`reseller_checkout_links?id=eq.${encodeURIComponent(id)}&select=id,reseller_id,category,code,expires_at,payment_id`);
    if (!row) throw new HttpException("Link checkout tidak ditemukan.", 404);
    return row;
  }

  async hostedOffer(link: ResellerLink, item: CatalogItem) {
    if (link.category !== item.category || link.code !== item.code || link.payment_id || Date.parse(link.expires_at) <= Date.now())
      throw new HttpException("Link checkout sudah digunakan, kedaluwarsa, atau produk berubah.", 409);
    const [{ member }, price, percent] = await Promise.all([
      this.access(link.reseller_id, true), this.price(link.category, link.code), this.hostedPercent(),
    ]);
    const wholesale = resellerAmount(item, price, "starter");
    const commission = wholesale ? Math.floor((item.price - wholesale) * percent / 100) : 0;
    if (commission < 1) throw new HttpException("Produk ini belum tersedia untuk checkout melalui link.", 409);
    return { shopName: member.shop_name, commission, percent };
  }
}
