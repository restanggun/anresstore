import { LayoutGrid, Gamepad2, AppWindow, Smartphone, Users, FileText } from "lucide-react";

export const categoryInfo = [
  { name: "Top up game", detail: "Isi waktu bermain", icon: Gamepad2, art: "game", title: "Saatnya lanjut main.", description: "Jelajahi Mobile Legends, Free Fire, dan Roblox dari satu katalog." },
  { name: "Format tugas", detail: "Dokumen lebih tertata", icon: FileText, art: "document", title: "Biar tugas lebih rapi.", description: "Lihat bantuan format dokumen dan presentasi sebelum menentukan kebutuhanmu." },
  { name: "Booster media sosial", detail: "Untuk aktivitas sosial", icon: Users, art: "social", title: "Aktivitas sosial, lebih terarah.", description: "Kenali layanan untuk kebutuhan akun media sosial dan baca keterangannya di katalog." },
  { name: "Aplikasi premium", detail: "Untuk ide dan karya", icon: AppWindow, art: "apps", title: "Buka ruang untuk berkarya.", description: "Temukan aplikasi untuk desain dan produktivitas, mulai dari Canva." },
  { name: "PPOB", detail: "Kebutuhan sehari-hari", icon: Smartphone, art: "ppob", title: "Kebutuhan harian, satu tempat.", description: "Jelajahi pulsa, paket data, dan token listrik dalam kategori PPOB." },
] as const;
export const categories = ["Semua", ...categoryInfo.map(category => category.name)];
export const services = [
  { name: "Mobile Legends", category: "Top up game", code: "ML", color: "blue", description: "Pilihan diamond untuk kebutuhan main kamu. Pilih nominal dan lihat harganya langsung di katalog." },
  { name: "Free Fire", category: "Top up game", code: "FF", color: "orange", description: "Top up diamond Free Fire. Lihat pilihan nominal dan ketentuan produk di katalog." },
  { name: "Roblox", category: "Top up game", code: "Rb", color: "dark", description: "Kebutuhan Roblox dalam satu tempat. Metode pengiriman dan pilihan produk akan dijelaskan sebelum pembelian." },
  { name: "Canva", category: "Aplikasi premium", code: "Ca", color: "teal", description: "Kebutuhan desain dan presentasi. Baca jenis akses, durasi, dan ketentuan pada setiap pilihan." },
  { name: "Pulsa & paket data", category: "PPOB", code: "08", color: "pink", description: "Pilihan pulsa dan paket data. Pilih operator, paket, dan nominal sesuai kebutuhanmu." },
  { name: "Token listrik", category: "PPOB", code: "PLN", color: "yellow", description: "Kebutuhan token listrik prabayar. Nominal dan biaya layanan akan ditampilkan sebelum pembayaran." },
  { name: "Layanan media sosial", category: "Booster media sosial", code: "@", color: "blue", description: "Lihat pilihan layanan untuk akun sosial kamu. Lingkup layanan dan ketentuannya akan dijelaskan di katalog." },
  { name: "Rapikan tugas", category: "Format tugas", code: "Aa", color: "pink", description: "Format dokumen Word, PDF, dan presentasi. Lingkup pekerjaan, revisi, dan waktu pengerjaan disepakati sebelum mulai." },
];
export const categoryIcons = [LayoutGrid, ...categoryInfo.map(category => category.icon)];
export const questions: [string, string][] = [
  ["Sudah bisa transaksi di website ini?", "Katalog sudah tersedia. Pilih produk dan ikuti informasi pesanan serta pembayaran di halaman checkout."],
  ["Apa saja layanan Anres Store?", "Layanan mencakup top up game, format tugas, booster media sosial, aplikasi premium, dan PPOB."],
  ["Di mana harga dan kontak bantuan?", "Lihat harga dan ketentuan pada halaman produk. Kunjungi Bantuan jika membutuhkan informasi tambahan."],
];
export type Service = typeof services[number];

