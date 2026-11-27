import type { Metadata } from "next";
import { categorySlugs, type CatalogKind } from "./catalog";
import { domains } from "./domains";
import { storeSummary } from "./store-copy";
import { serviceList } from "./storefront";

export const catalogDescription = `Jelajahi ${serviceList} di Anres Store.`;
export const storeDescription = `${storeSummary} Katalog mencakup ${serviceList}.`;

export const categoryDescriptions: Record<CatalogKind, string> = {
  "Top up game": "Cek pilihan dan harga top up game seperti Mobile Legends, Free Fire, dan Roblox di Anres Store.",
  PPOB: "Jelajahi pilihan pulsa, paket data, dan token listrik di katalog PPOB Anres Store.",
  "Booster media sosial": "Lihat pilihan layanan booster media sosial serta persyaratan pemesanan setiap layanan di Anres Store.",
  "Aplikasi premium": "Temukan pilihan aplikasi premium dan bandingkan paket, masa aktif, serta ketentuan penggunaannya di Anres Store.",
  "Joki tugas": "Lihat pilihan layanan dokumen dan presentasi beserta lingkup pekerjaan, tenggat, dan opsi revisi di Anres Store.",
};

export function categoryFromSlug(slug: string) {
  return (Object.keys(categorySlugs) as CatalogKind[]).find(category => categorySlugs[category] === slug);
}

export function publicPageMetadata(surface: "web" | "app", path: string, title: string, description: string): Metadata {
  const url = new URL(path, domains[surface]);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "id_ID", siteName: "Anres Store", title, description, url },
    twitter: { card: "summary", title, description },
  };
}
