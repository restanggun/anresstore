
import { redirect } from "next/navigation";
import { Catalog } from "@/components/storefront/catalog";
import { categories } from "@/lib/storefront";
import { categorySlugs, type CatalogKind } from "@/lib/catalog";
import { publicPageMetadata } from "@/lib/seo";
export const metadata = publicPageMetadata("app", "/katalog", "Katalog Layanan Digital | Anres Store", "Jelajahi top up game, PPOB, aplikasi premium, booster media sosial, dan layanan proyek kreatif di Anres Store.");
export default async function CatalogPage({searchParams}: {searchParams:Promise<{kategori?:string;q?:string}>}) {
  const query = await searchParams;
  const category = query.kategori && categories.includes(query.kategori) ? query.kategori : "Semua";
  if (category !== "Semua" && Object.hasOwn(categorySlugs, category)) redirect(`/katalog/${categorySlugs[category as CatalogKind]}`);
  const initialQuery = query.q?.slice(0, 80) ?? "";
  return <main id="main" className="container catalog-page"><Catalog key={`${category}:${initialQuery}`} initialCategory={category} initialQuery={initialQuery} /></main>;
}
 

