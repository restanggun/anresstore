import type { CatalogItem, CatalogKind } from "@/lib/catalog";

type DemoOffer = CatalogItem & { category: CatalogKind; demo: true };
const samples: [CatalogKind, string, string, number, number][] = [
  ["Top up game", "Mobile Legends", "1000 Diamond", 200000, 175000],
  ["Top up game", "Mobile Legends", "250 Diamond", 60000, 52000],
  ["Top up game", "Mobile Legends", "500 Diamond", 110000, 95000],
  ["Top up game", "Free Fire", "500 Diamond", 75000, 65000],
  ["Top up game", "Free Fire", "1000 Diamond", 150000, 130000],
  ["Top up game", "Roblox", "400 Robux", 80000, 70000],
  ["Top up game", "PUBG Mobile", "600 UC", 140000, 120000],
  ["Aplikasi premium", "Netflix", "Premium 1 bulan", 75000, 65000],
  ["Aplikasi premium", "Claude", "Langganan 1 bulan", 100000, 90000],
  ["PPOB", "Paket data", "Paket 10 GB", 35000, 30000],
  ["Aplikasi premium", "Spotify", "Premium 1 bulan", 50000, 40000],
  ["Booster media sosial", "Instagram", "1000 followers", 50000, 40000],
  ["PPOB", "Pulsa", "Pulsa Rp50.000", 52000, 48000],
  ["Joki tugas", "Makalah", "Format dokumen", 30000, 25000],
];
export const demoFlashOffers: DemoOffer[] = samples.map(([category, product, displayName, originalPrice, price], index) => ({
  category, product, displayName, name: displayName, code: `demo-${index}`, productSlug: product.toLowerCase().replace(/\s+/g, "-"),
  section: "Contoh flash sale", group: "Contoh", type: "Contoh", brand: "", description: "Data contoh", price, demo: true,
  promotion: { id: `demo-${index}`, startsAt: "2020-01-01T00:00:00Z", endsAt: "2027-12-31T16:59:59Z", originalPrice, discountPercent: Math.floor((originalPrice - price) * 100 / originalPrice) },
}));
