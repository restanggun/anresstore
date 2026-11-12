import { notFound } from "next/navigation";
import { Catalog } from "@/components/storefront/catalog";
import "../../../landing.css";
const products: Record<string, string[]> = { "Top up game": ["Mobile Legends", "Free Fire", "Roblox", "PUBG Mobile", "Genshin Impact", "Valorant"], "PPOB": ["Pulsa", "Paket data", "Token listrik", "E-wallet"], "Booster media sosial": ["Instagram", "TikTok", "YouTube", "Facebook"], "Aplikasi premium": ["ChatGPT", "Claude", "Netflix", "Disney+", "Canva", "Spotify"], "Format tugas": ["Artikel", "Makalah", "Tesis", "Skripsi", "Esai", "Laporan"] };
const categorySlugs = { "Top up game": "top-up-game", "PPOB": "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Format tugas": "format-tugas" };
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export default async function ProductPage({ params }: { params: Promise<{ kategori: string; produk: string }> }) {
  const { kategori, produk } = await params;
  const category = Object.entries(categorySlugs).find(([, slug]) => slug === kategori)?.[0];
  const product = category && products[category]?.find(name => slugify(name) === produk);
  if (!category || !product) notFound();
  return <main id="main" className="container catalog-page"><Catalog initialCategory={category} initialProduct={product}/></main>;
}
