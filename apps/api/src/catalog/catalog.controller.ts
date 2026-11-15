import { Controller, Get, HttpException, Param } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mapCatalog, sellingPrice, type CatalogSource, type CatalogItem } from "./catalog-mapping";
import { presentCatalog, type CatalogCampaign } from "./catalog-promotions";
import { adminDb, managedCatalog } from "../admin/admin-store";
import { featuredGameSlugs } from "./featured-games";
export { sellingPrice } from "./catalog-mapping";

const TTL_MS = 60_000;
const RETRY_MS = 10_000;

@Controller("catalog")
export class CatalogController {
  private cache = new Map<string, { expires: number; value: Awaited<ReturnType<CatalogController["load"]>> }>();
  private pending = new Map<string, ReturnType<CatalogController["load"]>>();
  private failures = new Map<string, number>();

  @Get(":category")
  async list(@Param("category") category: string, raw = false) {
    if (category !== "game" && category !== "prepaid" && category !== "apps" && category !== "social" && category !== "tasks") throw new HttpException("Kategori tidak tersedia.", 404);
    if (category === "tasks" || category === "apps") return this.present(category, { source: "vipayment", updatedAt: new Date().toISOString(), items: [], products: [] }, raw);
    const id = process.env.VIPAYMENT_API_ID?.trim(), key = process.env.VIPAYMENT_API_KEY?.trim();
    if (!id || !key) {
      if (process.env.ADMIN_CATALOG_ENABLED === "true") return this.present(category, { source: "vipayment", updatedAt: new Date().toISOString(), items: [], products: [] }, raw);
      throw new HttpException("Katalog belum dikonfigurasi.", 503);
    }
    const cacheKey = category + createHash("sha256").update(JSON.stringify([id, key])).digest("hex");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return this.present(category, cached.value, raw);
    if ((this.failures.get(cacheKey) ?? 0) > Date.now()) throw new HttpException("Katalog penyedia tidak tersedia. Coba lagi nanti.", 503);
    const pending = this.pending.get(cacheKey);
    if (pending) return this.present(category, await pending, raw);
    const request = this.load(category, id, key).then(value => {
      if (this.cache.size >= 5) this.cache.clear();
      this.cache.set(cacheKey, { value, expires: Date.now() + TTL_MS });
      this.failures.delete(cacheKey);
      return value;
    }).catch(() => {
      if (this.failures.size >= 5) this.failures.clear();
      this.failures.set(cacheKey, Date.now() + RETRY_MS);
      throw new HttpException("Katalog penyedia tidak tersedia. Coba lagi nanti.", 503);
    }).finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, request);
    return this.present(category, await request, raw);
  }

  private async present(category: string, value: Awaited<ReturnType<CatalogController["load"]>>, raw = false) {
    if (raw) return { ...presentCatalog(value), catalogRevision: null };
    const [version] = process.env.ADMIN_CATALOG_ENABLED === "true"
      ? await adminDb<{version: number}>("catalog_versions", `?category=eq.${category}&select=version`) : [];
    if (process.env.ADMIN_CATALOG_ENABLED === "true" && !version) throw new HttpException("Versi katalog belum tersedia.", 503);
    const items = await managedCatalog(value.items, category);
    const campaigns = process.env.ADMIN_CATALOG_ENABLED === "true" ? await adminDb<CatalogCampaign>("catalog_promotions", `?category=eq.${category}&active=eq.true&select=*`) : [];
    return { ...presentCatalog({ ...value, items }, Date.now(), campaigns), catalogRevision: version ? String(version.version) : null };
  }

  private async load(category: CatalogSource | "apps", id: string, key: string) {
    const sign = createHash("md5").update(id + key).digest("hex");
    const response = await fetch(`https://vip-reseller.co.id/api/${category === "prepaid" ? "prepaid" : category === "social" ? "social-media" : "game-feature"}`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, sign, type: category === "social" ? "service" : "services" }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("result" in result) || result.result !== true || !("data" in result) || !Array.isArray(result.data) || result.data.length > 50000) throw new Error("Invalid provider catalog");
    const mapped = mapCatalog(category === "prepaid" ? "prepaid" : category === "social" ? "social" : "game", result.data);
    const items: CatalogItem[] = mapped.filter(item => item.category === category);
    // Keep every other available provider service importable, but require a human
    // workflow when its destination fields are not supported by automatic fulfillment.
    if (category !== "social") {
      const recognized = new Set(mapped.map(item => item.code));
      const clean = (v: unknown, max = 200) => typeof v === "string" ? v.replace(/<[^>]*>/g," ").replace(/[\u0000-\u001f]/g," ").trim().slice(0,max) : "";
      const seen = new Set<string>();
      for (const value of result.data) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, any>;
        const code = clean(row.code,120), name = clean(row.name || row.service), group = clean(row.game || row.brand,100), cost = Number(row.price?.basic ?? row.price);
        if (row.status !== "available" || recognized.has(code) || seen.has(code) || !/^[A-Za-z0-9._-]+$/.test(code) || !name || !group || !Number.isSafeInteger(cost) || cost < 1) continue;
        seen.add(code);
        items.push({code,name,displayName:name,category,product:group,productSlug:group.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),group,type:clean(row.type),brand:group,section:group,price:sellingPrice(cost),providerCost:cost,description:clean(row.description || row.note,2000),fulfillmentMode:"manual",requiresManualReview:true});
      }
    }
    if(category === "game") items.sort((a,b)=>featuredGameSlugs.indexOf(a.productSlug)-featuredGameSlugs.indexOf(b.productSlug) || a.price-b.price || a.code.localeCompare(b.code));
    const products = [...new Set(items.map(item => item.product))].map(name => {
      const variants = items.filter(item => item.product === name);
      return { name, slug: variants[0]!.productSlug, count: variants.length, minPrice: Math.min(...variants.map(item => item.price)) };
    });
    return { source: "vipayment" as const, updatedAt: new Date().toISOString(), items, products };
  }
}
