export type CatalogKind = "Top up game" | "PPOB" | "Booster media sosial" | "Aplikasi premium" | "Format tugas";
export type CatalogPromotion = { id: string; startsAt: string; endsAt: string; originalPrice: number; discountPercent: number };
export type CatalogItem = {
  code: string; name: string; displayName: string; section: string; group: string; type: string; price: number;
  product: string; productSlug: string; brand: string; description: string; promotion: CatalogPromotion | null;
};
export type CatalogProduct = { name: string; slug: string; category: CatalogKind; count: number; minPrice: number; regularMinPrice?: number; promotion: CatalogPromotion | null; offerName?: string | null; offerCode?: string | null };
export type CatalogFeed = { items: CatalogItem[]; products: Omit<CatalogProduct, "category">[]; serverTime: string };
export const categorySlugs: Record<CatalogKind, string> = { "Top up game": "top-up-game", PPOB: "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Format tugas": "format-tugas" };
export const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
export function publicOrderDetails(details: string, category: string): string {
  if (!["Top up game","PPOB","Aplikasi premium"].includes(category)) return details;
  const parts=details.split(" · ");
  return parts.length === 3 && /^[A-Za-z0-9._-]+$/.test(parts[2]!) ? parts[0]! : details;
}
export const isPromotionActive = (promotion: CatalogPromotion | null | undefined, now: number) => !!promotion && Date.parse(promotion.startsAt) <= now && now < Date.parse(promotion.endsAt);
export function currentPrice(item: {price: number; promotion: CatalogPromotion | null}, now: number) {
  return item.promotion && !isPromotionActive(item.promotion,now) ? item.promotion.originalPrice : item.price;
}

// Keep the exact selected service code; merge only identical alternatives within the same region/terms.
export function tidyVariants(items: CatalogItem[]): CatalogItem[] {
  const variants = new Map<string,CatalogItem>();
  for (const item of items) {
    const region = item.group.replace(/\s+[AB]$/i, "").toLowerCase();
    // This provider boilerplate repeats the destination form and adds no purchase condition.
    const operationalNote = /^instant process masukan user id dan server \(jika dibutuhkan\)\. jika pending lebih 5 menit push ke whatsapp admin\.?$/i.test(item.description.trim());
    const terms = operationalNote ? "" : item.description;
    const key = JSON.stringify([item.displayName.toLowerCase(),item.section,region,terms]);
    const existing = variants.get(key);
    if (!existing || item.price < existing.price) variants.set(key,item);
  }
  return [...variants.values()].sort((a,b) => a.price-b.price || a.displayName.localeCompare(b.displayName,"id",{numeric:true}));
}

export function variantHint(item: CatalogItem): string {
  if (/\bglobal\b/i.test(item.group) && !/\bglobal\b/i.test(item.displayName)) return "Global";
  if (/\bslow\b/i.test(item.group)) return "Proses bertahap";
  if (/\bpromo\b/i.test(item.group)) return "Paket promo";
  return "";
}
