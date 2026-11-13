import type { CatalogItem } from "./catalog-mapping";

// Fixture for the future dashboard. Dates are absolute and never restart per visitor.
export const catalogCampaigns = [
  { id: "anres-game-week", products: ["mobile-legends", "free-fire"], discountPercent: 3, startsAt: "2026-11-13T00:00:00+07:00", endsAt: "2026-11-20T23:59:59+07:00" },
  { id: "anres-creative-week", products: ["canva"], discountPercent: 3, startsAt: "2026-11-13T00:00:00+07:00", endsAt: "2026-11-20T23:59:59+07:00" },
];

export function presentCatalog(data: { items: CatalogItem[]; updatedAt: string; source: "vipayment" }, now = Date.now()) {
  const items = data.items.map(item => {
    const campaign = catalogCampaigns.find(promo => promo.products.includes(item.productSlug) && Date.parse(promo.startsAt) <= now && now < Date.parse(promo.endsAt));
    const price = campaign ? Math.ceil(item.price * (1 - campaign.discountPercent / 100) / 100) * 100 : item.price;
    const promotion = campaign && price < item.price ? { id: campaign.id, startsAt: campaign.startsAt, endsAt: campaign.endsAt, originalPrice: item.price, discountPercent: Math.floor((item.price - price) * 100 / item.price) } : null;
    return { ...item, price, promotion };
  });
  const products = [...new Set(items.map(item => item.product))].map(name => {
    const variants = items.filter(item => item.product === name).sort((a,b) => a.price - b.price || a.code.localeCompare(b.code));
    const cheapest = variants[0]!;
    const best = variants.find(item=>item.promotion) || cheapest;
    const regularMinPrice = Math.min(...variants.map(item=>item.promotion?.originalPrice ?? item.price));
    return { name, slug: best.productSlug, count: variants.length, minPrice: best.price, regularMinPrice, promotion: best.promotion, offerName: best.promotion ? best.displayName : null, offerCode: best.promotion ? best.code : null };
  });
  return { ...data, items, products, serverTime: new Date(now).toISOString() };
}
