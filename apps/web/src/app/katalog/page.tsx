import "../landing.css";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Catalog } from "@/components/storefront/catalog";
import { categories } from "@/lib/storefront";
export const metadata: Metadata = { title: "Katalog | Anres Store", description: "Jelajahi top up game, aplikasi premium, dan kebutuhan digital di Anres Store." };
export default async function CatalogPage({searchParams}: {searchParams:Promise<{kategori?:string;q?:string}>}) {
  const query = await searchParams;
  const category = query.kategori && categories.includes(query.kategori) ? query.kategori : "Semua";
  const slugs: Record<string, string> = { "Top up game": "top-up-game", "PPOB": "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Format tugas": "format-tugas" };
  if (category !== "Semua" && slugs[category]) redirect(`/katalog/${slugs[category]}`);
  const initialQuery = query.q?.slice(0, 80) ?? "";
  return <main id="main" className="container catalog-page"><Catalog key={`${category}:${initialQuery}`} initialCategory={category} initialQuery={initialQuery} /></main>;
}
 
