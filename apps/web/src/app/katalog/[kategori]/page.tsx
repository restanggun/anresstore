import { notFound } from "next/navigation";
import { Catalog } from "@/components/storefront/catalog";
import "../../landing.css";
const categorySlugs = { "Top up game": "top-up-game", "PPOB": "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Format tugas": "format-tugas" };
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export default async function CategoryPage({ params, searchParams }: { params: Promise<{ kategori: string }>; searchParams: Promise<{ q?: string }> }) {
  const { kategori } = await params;
  const { q = "" } = await searchParams;
  const category = Object.entries(categorySlugs).find(([, slug]) => slug === kategori)?.[0];
  if (!category) notFound();
  return <main id="main" className="container catalog-page"><Catalog key={`${category}:${q}`} initialCategory={category} initialQuery={q}/></main>;
}
