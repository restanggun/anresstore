import { Controller, Get, HttpException, Param } from "@nestjs/common";
import { createHash } from "node:crypto";

type ProviderItem = { code?: unknown; name?: unknown; service?: unknown; game?: unknown; brand?: unknown; type?: unknown; status?: unknown; price?: unknown };

export function sellingPrice(cost: number): number {
  const rate = cost < 10000 ? 1.25 : cost < 30000 ? 1.2 : cost < 60000 ? 1.15 : cost < 100000 ? 1.1 : 1.05;
  return Math.ceil(cost * rate / 100) * 100;
}

@Controller("catalog")
export class CatalogController {
  @Get(":category")
  async list(@Param("category") category: string) {
    if (category !== "game" && category !== "prepaid") throw new HttpException("Kategori tidak tersedia.", 404);
    const id = process.env.VIPAYMENT_API_ID, key = process.env.VIPAYMENT_API_KEY;
    if (!id || !key) throw new HttpException("Katalog belum dikonfigurasi.", 503);
    const sign = createHash("md5").update(id + key).digest("hex");
    let response: globalThis.Response;
    try {
      response = await fetch(`https://vip-reseller.co.id/api/${category === "game" ? "game-feature" : "prepaid"}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ key, sign, type: "services" }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new HttpException("Katalog penyedia tidak tersedia.", 503); }
    const result = await response.json().catch(() => null) as { result?: boolean; data?: ProviderItem[] } | null;
    if (!response.ok || !result?.result || !Array.isArray(result.data)) throw new HttpException("Katalog penyedia tidak tersedia.", 503);
    const items = result.data.flatMap((item) => {
      const price = item.price && typeof item.price === "object" ? (item.price as { basic?: unknown }).basic : item.price;
      const cost = Number(price);
      const name = item.name || item.service;
      if (typeof item.code !== "string" || !item.code || typeof name !== "string" || !name || String(item.status).toLowerCase() !== "available" || !Number.isSafeInteger(cost) || cost <= 0) return [];
      return [{ code: item.code, name, group: String(item.game || item.brand || ""), type: String(item.type || ""), price: sellingPrice(cost) }];
    });
    return { items };
  }
}
