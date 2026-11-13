import { Controller, Get, HttpException, Param } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mapCatalog, type CatalogSource } from "./catalog-mapping";
import { presentCatalog } from "./catalog-promotions";
import { managedCatalog } from "../admin/admin-store";
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
  async list(@Param("category") category: string) {
    if (category !== "game" && category !== "prepaid" && category !== "apps") throw new HttpException("Kategori tidak tersedia.", 404);
    const id = process.env.VIPAYMENT_API_ID?.trim(), key = process.env.VIPAYMENT_API_KEY?.trim();
    if (!id || !key) {
      if (process.env.ADMIN_CATALOG_ENABLED === "true") return this.present(category, { source: "vipayment", updatedAt: new Date().toISOString(), items: [], products: [] });
      throw new HttpException("Katalog belum dikonfigurasi.", 503);
    }
    const cacheKey = category + createHash("sha256").update(JSON.stringify([id, key])).digest("hex");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return this.present(category, cached.value);
    if ((this.failures.get(cacheKey) ?? 0) > Date.now()) throw new HttpException("Katalog penyedia tidak tersedia. Coba lagi nanti.", 503);
    const pending = this.pending.get(cacheKey);
    if (pending) return this.present(category, await pending);
    const request = this.load(category, id, key).then(value => {
      if (this.cache.size >= 3) this.cache.clear();
      this.cache.set(cacheKey, { value, expires: Date.now() + TTL_MS });
      this.failures.delete(cacheKey);
      return value;
    }).catch(() => {
      if (this.failures.size >= 3) this.failures.clear();
      this.failures.set(cacheKey, Date.now() + RETRY_MS);
      throw new HttpException("Katalog penyedia tidak tersedia. Coba lagi nanti.", 503);
    }).finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, request);
    return this.present(category, await request);
  }

  private async present(category: string, value: Awaited<ReturnType<CatalogController["load"]>>) {
    return presentCatalog({ ...value, items: await managedCatalog(value.items, category) });
  }

  private async load(category: CatalogSource | "apps", id: string, key: string) {
    const sign = createHash("md5").update(id + key).digest("hex");
    const response = await fetch(`https://vip-reseller.co.id/api/${category === "prepaid" ? "prepaid" : "game-feature"}`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, sign, type: "services" }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("result" in result) || result.result !== true || !("data" in result) || !Array.isArray(result.data) || result.data.length > 50000) throw new Error("Invalid provider catalog");
    const items = mapCatalog(category === "prepaid" ? "prepaid" : "game", result.data).filter(item => item.category === category && (category !== "game" || featuredGameSlugs.includes(item.productSlug)));
    if(category === "game") items.sort((a,b)=>featuredGameSlugs.indexOf(a.productSlug)-featuredGameSlugs.indexOf(b.productSlug) || a.price-b.price || a.code.localeCompare(b.code));
    const products = [...new Set(items.map(item => item.product))].map(name => {
      const variants = items.filter(item => item.product === name);
      return { name, slug: variants[0]!.productSlug, count: variants.length, minPrice: Math.min(...variants.map(item => item.price)) };
    });
    return { source: "vipayment" as const, updatedAt: new Date().toISOString(), items, products };
  }
}
