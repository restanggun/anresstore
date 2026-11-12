# Rancangan Anres Store

Rangkuman sesi perencanaan. Dokumen ini membedakan keputusan dan rekomendasi. Aplikasi baru belum dibuat.

## Keputusan yang disepakati

- Bangun ulang sebagai proyek lengkap untuk bisnis Anres Store.
- Cakupan: company profile, brand guideline, website toko, dashboard admin, dan backend.
- Gunakan Supabase langsung, tanpa Prisma.
- Bot WhatsApp ditunda; jangan buat folder atau implementasinya pada tahap awal.
- Struktur repository disiapkan untuk pengelolaan profesional di GitHub.
- Lokasi target: D:\anres-store. Proyek lama: D:\anresbot.
- Pembuatan folder target sebelumnya ditolak dengan Access denied; jangan menganggap scaffold sudah tersedia.

## Stack target

| Bagian | Stack |
| --- | --- |
| Website dan company profile | Next.js + TypeScript |
| Dashboard admin | Next.js + TypeScript |
| Tampilan | Tailwind CSS + shadcn/ui |
| Backend | NestJS + TypeScript |
| Database | Supabase PostgreSQL |
| Akses Supabase | supabase-js |
| Login | Supabase Auth |
| File dan gambar | Supabase Storage |
| Transaksi atomik | PostgreSQL Functions / Supabase RPC |
| Migrasi | SQL + Supabase CLI, disimpan di Git |
| Antrean saat diperlukan | Redis + BullMQ |
| Hosting aplikasi | Docker Compose di VPS sebagai arah awal |

Versi dependency, package manager, domain, akun cloud, dan penyedia VPS belum ditentukan. Tidak ada Prisma.

## Struktur folder target

```text
D:\anres-store\
|-- apps/
|   |-- web/                  Company profile, katalog, checkout, akun
|   |   |-- src/app/
|   |   |-- src/components/
|   |   |-- src/features/
|   |   |-- src/lib/
|   |   `-- public/
|   |-- admin/                Dashboard operasional
|   |   |-- src/app/
|   |   |-- src/components/
|   |   `-- src/features/
|   |-- api/                  Backend NestJS
|   |   |-- src/modules/
|   |   |   |-- identity/
|   |   |   |-- catalog/
|   |   |   |-- pricing/
|   |   |   |-- orders/
|   |   |   |-- payments/
|   |   |   |-- fulfillment/
|   |   |   |-- notifications/
|   |   |   `-- audit/
|   |   |-- src/common/
|   |   `-- src/config/
|   `-- worker/               Pemrosesan asinkron saat diperlukan
|-- packages/
|   |-- supabase/             Client server dan tipe database
|   |-- contracts/            Kontrak API, validasi, tipe event
|   |-- ui/                   Komponen dan token desain bersama
|   `-- config/               Konfigurasi TypeScript dan tooling
|-- supabase/
|   |-- migrations/           Migrasi SQL; sumber perubahan skema
|   |-- tests/                Uji RLS dan fungsi transaksi
|   |-- seed.sql              Data sintetis development
|   `-- config.toml           Dibuat saat inisialisasi CLI
|-- business/
|   |-- company-profile.md
|   |-- business-model.md
|   |-- products-and-suppliers.md
|   `-- finance-and-metrics.md
|-- brand/
|   |-- guidelines.md
|   `-- assets/
|       |-- logos/
|       |-- icons/
|       |-- social/
|       `-- source/
|-- docs/
|   |-- product/              MVP dan roadmap
|   |-- architecture/         Sistem, model data, siklus pesanan
|   |-- api/                  Kontrak integrasi
|   |-- decisions/            Keputusan dan alasannya
|   |-- operations/           SOP, refund, rekonsiliasi, insiden
|   |-- security/             Kontrol akses dan data
|   |-- migration/            Perpindahan dari proyek lama
|   `-- governance/           Kepemilikan, GitHub, lisensi
|-- infra/                    Docker dan deployment
|-- scripts/                  Otomasi development dan pemeriksaan
|-- .github/
|   |-- workflows/
|   |-- ISSUE_TEMPLATE/
|   `-- pull_request_template.md
|-- .editorconfig
|-- .gitattributes
|-- .gitignore
|-- AGENTS.md
|-- README.md
|-- CONTRIBUTING.md
|-- SECURITY.md
|-- CHANGELOG.md
`-- package.json
```

Ini struktur yang direncanakan, bukan daftar aplikasi yang sudah berjalan. Folder dan modul dibuat bertahap sesuai implementasi. Tidak ada apps/whatsapp atau paket Prisma.

## Arsitektur

```text
Website pelanggan --+
                    +--> Backend NestJS --> Supabase PostgreSQL
Dashboard admin ----+         |             Supabase Auth
                              |             Supabase Storage
                         Redis / BullMQ
                              |
                            Worker
                              |
                    Gateway pembayaran / pemasok
```

- Frontend dapat menggunakan Supabase Auth untuk login.
- Aturan harga, otorisasi order, pembayaran, dan pemenuhan berada di backend.
- Kunci rahasia Supabase dan provider hanya di server.
- Gunakan RLS untuk akses client yang diizinkan. Backend dengan hak tinggi tetap memeriksa role dan ownership.
- SQL function/RPC dipakai untuk operasi atomik. Beberapa request supabase-js tidak otomatis menjadi satu transaksi.
- Simpan migrasi SQL dan tipe database dalam repository. Tidak menggunakan Prisma.
- Company profile dimulai dalam aplikasi web yang sama agar tidak menambah aplikasi terpisah.

## Ruang lingkup awal yang diusulkan

### Website

Tentang usaha, layanan aktif, katalog, detail produk, checkout dengan biaya total, halaman status berizin, akun dan riwayat pesanan, kontak, bantuan, dan kebijakan publik.

### Admin

Produk dan harga, ketersediaan, order, pembayaran, fulfillment, refund, audit, rekonsiliasi, serta hak akses admin.

### Integrasi transaksi

Mulai dengan satu gateway dan satu pemasok untuk kategori awal. Tripay dan VIPayment ada pada proyek lama dan menjadi kandidat; penggunaan produksi masih perlu dikonfirmasi.

Verifikasi signature callback, nominal, dan referensi di server. Callback berulang tidak boleh menggandakan fulfillment. Jika hasil pembelian timeout tidak diketahui, cek status pemasok sebelum membeli ulang. Pisahkan retry pesan dari retry pembelian. Simpan riwayat perubahan status.

## Model data awal yang diusulkan

Profil pengguna dan role, kategori, produk/SKU, pemetaan pemasok, snapshot harga, order dan item, payment attempt, webhook inbox, fulfillment attempt, refund, status history, audit log, outbox, dan tiket bantuan bila diperlukan.

Pisahkan status pembayaran, fulfillment, dan refund. Gunakan nilai rupiah integer, waktu UTC, serta constraint unik referensi provider. Skema final belum dibuat.

## Rekomendasi kebutuhan bisnis

1. Profil usaha: identitas yang terverifikasi, deskripsi, visi/misi, kontak, jam layanan, dan produk aktif.
2. Brand guideline: logo, warna, tipografi, gaya bahasa, dan template media sosial.
3. Data pemasok: harga pokok, margin, SKU, ketersediaan, dukungan, dan kebijakan kegagalan.
4. SOP bantuan: verifikasi pemilik order, pencatatan tiket, eskalasi, dan refund.
5. Rekonsiliasi harian: cocokkan pembayaran, transaksi pemasok, order, refund, dan saldo deposit.
6. Laporan bisnis: pisahkan omzet, biaya gateway, biaya pemasok, biaya operasional, dan laba.
7. Kebijakan privasi, syarat layanan, dan refund berdasarkan praktik usaha nyata.
8. Monitoring, backup, uji restore, dan prosedur insiden.
9. Analitik: konversi, transaksi sukses/gagal, pesanan tertunda, margin, dan pembelian ulang.

Loyalty, reseller, aplikasi mobile native, dan dompet pelanggan sebaiknya menunggu transaksi inti stabil. Seluruh kategori lama tidak otomatis masuk MVP.

## Arah brand

Usulan karakter: jelas, ramah, transparan, dan dapat diandalkan. Logo, warna, font, slogan, dan aset visual final belum dipilih atau disetujui. Jangan mengklaim mitra resmi, layanan 24 jam, termurah, atau pasti instan tanpa bukti.

## Standar GitHub

- Satu monorepo. Rekomendasi mulai private; visibilitas dan lisensi ditentukan pemilik.
- README memuat tujuan, status nyata, struktur, setup, dan validasi.
- CONTRIBUTING, SECURITY, CHANGELOG, dan AGENTS.md.
- Template issue/PR, branch main, serta branch feat/*, fix/*, docs/*.
- Commit jelas, misalnya feat(orders): add payment status history.
- CI build, typecheck, dan tes relevan setelah kode ada.
- Review dan proteksi branch diaktifkan melalui pengaturan GitHub.
- CODEOWNERS setelah username/team diketahui.
- Lockfile setelah package manager dipilih.
- Secret deployment disimpan terpisah dari kode.
- Lisensi tidak dipilih otomatis; keputusan tetap milik pemilik.

Jangan commit .env, token, service role key, sesi WhatsApp, database lama, backup, data pelanggan, stok kredensial, atau node_modules.

## Tahapan pengerjaan

1. Fondasi bisnis, folder/repository, produk awal, dan arah brand.
2. Bootstrap Next.js, NestJS, Supabase development, tooling, dan CI.
3. Katalog, login, peran, dan pengujian akses.
4. Checkout dan pembayaran sandbox, RPC atomik, idempotensi, dan antrean.
5. Dashboard, audit, refund, rekonsiliasi, dan bantuan.
6. Staging: uji kegagalan/duplikasi, akses lintas pengguna, backup/restore, dan monitoring.
7. Migrasi bertahap. Jangan biarkan dua sistem memproses transaksi yang sama.
8. Bot WhatsApp hanya jika diminta kembali pada tahap berikutnya.

## Keputusan yang masih terbuka

Identitas usaha, domain, kontak, jam layanan, produk MVP, pemasok, gateway, logo/palet final, akun GitHub, lisensi, anggaran, paket/region Supabase, VPS, guest checkout, retensi data, role admin, versi dependency, dan package manager.

## Referensi proyek lama

D:\anresbot berisi bot Node.js/Baileys, website, SQLite, dan integrasi pembayaran. Pemeriksaan awal menemukan area kontrol akses fallback pencarian transaksi serta detail pesanan yang dapat muncul di grup. Ini bukan audit menyeluruh.

Pertahankan proyek lama sebagai referensi. Jangan menyalin kredensial, data produksi, atau implementasi lama tanpa evaluasi. Aplikasi baru belum dibuat dan belum dipublikasikan ke GitHub.