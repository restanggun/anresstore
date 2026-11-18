import { notFound } from "next/navigation";
import { Catalog } from "@/components/storefront/catalog";
import { categoryDescriptions, categoryFromSlug, publicPageMetadata } from "@/lib/seo";
import "../../landing.css";

export async function generateMetadata({ params }: { params: Promise<{ kategori: string }> }) {
  const { kategori } = await params;
  const category = categoryFromSlug(kategori);
  if (!category) notFound();
  return publicPageMetadata("app", `/katalog/${kategori}`, `${category} | Anres Store`, categoryDescriptions[category]);
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ kategori: string }>; searchParams: Promise<{ q?: string }> }) {
  const { kategori } = await params;
  const { q = "" } = await searchParams;
  const category = categoryFromSlug(kategori);
  if (!category) notFound();
  return <main id="main" className="container catalog-page"><Catalog key={`${category}:${q}`} initialCategory={category} initialQuery={q}/></main>;
}
