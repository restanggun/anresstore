import { featuredGameSlugs } from "../catalog/featured-games";
import { HttpException } from "@nestjs/common";
import type { CatalogItem } from "../catalog/catalog-mapping";

export async function adminDb<T = Record<string, unknown>>(table: string, query: string, method = "GET", body?: unknown): Promise<T[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpException("Database belum dikonfigurasi pada server.", 503);
  try {
    const response = await fetch(`${url}/rest/v1/${table}${query}`, {
      method, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json", Prefer: table === "admin_audit_log" ? "return=representation" : "return=representation,resolution=merge-duplicates" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error();
    return rows as T[];
  } catch { throw new HttpException(`Data ${table} belum tersedia. Periksa koneksi dan migrasi database.`, 503); }
}

export type ManagedProduct = {
  id: string; provider: string; provider_code: string; category: CatalogItem["category"];
  product: string; product_slug: string; name: string; price: number; description: string; active: boolean; fulfillment_mode?: "manual" | "vipayment"; supplier_code?: string; service_quantity?: number;
};

export function mergeProducts(items: CatalogItem[], rows: ManagedProduct[], category: string, sourceItems = items): CatalogItem[] {
  const result = new Map(items.map(item => [item.code, item]));
  const sources = new Map(sourceItems.map(item => [item.code, item]));
  for (const row of rows.filter(row => row.category === category)) {
    const code = row.provider === "vipayment" && row.category !== "social" ? row.provider_code : `managed.${row.id}`;
    if (!row.active) { result.delete(code); continue; }
    // An admin override may change presentation and price, never supplier availability.
    const original = sources.get(row.supplier_code || row.provider_code);
    if (row.provider === "vipayment" && !original) continue;
    const quantity = row.service_quantity || original?.serviceQuantity || 1;
    if (category === "social" && original && (quantity < original.minimum! || quantity > original.maximum!)) continue;
    result.set(code, { ...original, code, category: row.category, name: row.name, displayName: row.name, product: row.product,
      productSlug: row.product_slug, price: row.price, description: row.description, group: original?.group ?? row.product,
      type: original?.type ?? row.category, brand: original?.brand ?? row.product, section: original?.section ?? (row.category === "tasks" ? "Paket tugas" : row.category === "apps" ? "Pilihan akses" : row.category === "social" ? "Pilihan layanan" : "Paket lainnya"), fulfillmentMode: original?.requiresManualReview ? "manual" : row.provider === "vipayment" ? (row.fulfillment_mode || "vipayment") : "manual", providerServiceCode: row.supplier_code || row.provider_code, serviceQuantity: quantity, providerCost: category === "social" && original?.providerCost ? Math.ceil(original.providerCost * quantity / 1000) : original?.providerCost });
  }
  return [...result.values()].sort((a, b) => a.product.localeCompare(b.product) || a.price - b.price);
}

export async function managedCatalog(items: CatalogItem[], category: string) {
  if (process.env.ADMIN_CATALOG_ENABLED !== "true") return category === "social" || category === "tasks" ? [] : category === "game" ? items.filter(item => !item.requiresManualReview && featuredGameSlugs.includes(item.productSlug)) : items.filter(item=>!item.requiresManualReview);
  const rows: ManagedProduct[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await adminDb<ManagedProduct>("managed_products", `?category=eq.${category}&select=*&order=id.asc&limit=500&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < 500) break;
    if (offset >= 49500) throw new HttpException("Katalog terlalu besar untuk dimuat sekaligus.", 503);
  }
  const defaults = category === "social" ? [] : category === "game" ? items.filter(item => !item.requiresManualReview && featuredGameSlugs.includes(item.productSlug)) : items.filter(item => !item.requiresManualReview);
  return mergeProducts(defaults, rows, category, items);
}
