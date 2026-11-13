import { HttpException } from "@nestjs/common";
import type { CatalogItem } from "../catalog/catalog-mapping";

export async function adminDb<T = Record<string, unknown>>(table: string, query: string, method = "GET", body?: unknown): Promise<T[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpException("Database belum dikonfigurasi pada server.", 503);
  try {
    const response = await fetch(`${url}/rest/v1/${table}${query}`, {
      method, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" },
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
  product: string; product_slug: string; name: string; price: number; description: string; active: boolean;
};

export function mergeProducts(items: CatalogItem[], rows: ManagedProduct[], category: string): CatalogItem[] {
  const result = new Map(items.map(item => [item.code, item]));
  for (const row of rows.filter(row => row.category === category)) {
    const code = row.provider === "vipayment" ? row.provider_code : `managed.${row.id}`;
    if (!row.active) { result.delete(code); continue; }
    result.set(code, { code, category: row.category, name: row.name, displayName: row.name, product: row.product,
      productSlug: row.product_slug, price: row.price, description: row.description, group: row.product,
      type: row.category, brand: row.provider, section: row.provider });
  }
  return [...result.values()].sort((a, b) => a.product.localeCompare(b.product) || a.price - b.price);
}

export async function managedCatalog(items: CatalogItem[], category: string) {
  if (process.env.ADMIN_CATALOG_ENABLED !== "true") return items;
  const rows = await adminDb<ManagedProduct>("managed_products", `?category=eq.${category}&select=*`);
  return mergeProducts(items, rows, category);
}
