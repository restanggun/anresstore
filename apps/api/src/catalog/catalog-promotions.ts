import type { CatalogItem } from "./catalog-mapping";
import { productPinRank } from "./catalog-pins";
export type CatalogCampaign = { category: string; item_code: string; sale_price: number; starts_at: string; ends_at: string; active: boolean };
export type ProductReviewSummary = { category: string; product_slug: string; review_count: number; average_rating: number };
export function presentCatalog(data: { items: CatalogItem[]; updatedAt: string; source: "vipayment" }, now = Date.now(), campaigns: CatalogCampaign[] = [], reviews: ProductReviewSummary[] = []) {
  const items = data.items.map(item => {
    const campaign = item.category === "tasks" ? undefined : campaigns.find(promo => promo.active && promo.category === item.category && promo.item_code === item.code && Date.parse(promo.starts_at) <= now && now < Date.parse(promo.ends_at) && Number.isSafeInteger(promo.sale_price) && promo.sale_price > 0 && promo.sale_price < item.price);
    const price = campaign ? campaign.sale_price : item.price;
    const promotion = campaign ? { id: `${campaign.category}:${campaign.item_code}`, startsAt: campaign.starts_at, endsAt: campaign.ends_at, originalPrice: item.price, discountPercent: Math.floor((item.price - price) * 100 / item.price) } : null;
    return { ...item, price, promotion, unitPrice: item.category === "social" ? price : undefined };
  });
  const products = [...new Set(items.map(item => item.productSlug))].map(slug => {
    const variants = items.filter(item => item.productSlug === slug).sort((a,b) => a.price - b.price || a.code.localeCompare(b.code));
    const cheapest = variants[0]!; const best = variants.find(item => item.promotion) || cheapest;
    const regularMinPrice = Math.min(...variants.map(item => item.promotion?.originalPrice ?? item.price));
    const review = reviews.find(item => item.category === best.category && item.product_slug === best.productSlug);
    return { name: best.product, slug: best.productSlug, pinRank: productPinRank(best.category, best.productSlug), developer: variants.find(item => item.developer)?.developer || "", count: variants.length, minPrice: best.price, regularMinPrice, promotion: best.promotion, offerName: best.promotion ? best.displayName : null, offerCode: best.promotion ? best.code : null, ratingCount: review?.review_count ?? 0, averageRating: Number(review?.average_rating ?? 0) };
  });
  return { ...data, items, products, serverTime: new Date(now).toISOString() };
}
