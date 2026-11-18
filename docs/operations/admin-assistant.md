# Asisten Anres

Asisten menggunakan sesi admin yang sudah ada. Setiap endpoint asisten memerlukan Supabase MFA level `aal2`, termasuk pada server dev yang melonggarkan MFA untuk fungsi admin lain. Chat dan penerapan draf juga memerlukan origin admin yang terdaftar. Agent membatasi tindakan ke bidangnya. Skill membantu model memilih tindakan dalam cakupan tersebut. Izin tetap diperiksa oleh server.

## Aktivasi

1. Terapkan migrasi `20261120100000_admin_assistant.sql` dan `20261120120000_admin_assistant_registry.sql`. Deploy rilis API dan dashboard yang memuat Pengelola Skill & Agent.
2. Isi `ADMIN_AI_OPENROUTER_API_KEY` dan `ADMIN_AI_OPENROUTER_MODEL` hanya di lingkungan API. Model harus berupa ID eksplisit yang mendukung keluaran JSON pada endpoint OpenRouter dengan Zero Data Retention dan pengumpulan data ditolak. Periksa tarif dan set batas pengeluaran di key/workspace. Key AI Bantuan publik terpisah.
3. Buka `nano /opt/anresstore/apps/api/.env.production` di VPS Anres. Buat OpenRouter key di [OpenRouter API Keys](https://openrouter.ai/keys). Pilih **Get API key** di [dashboard Tavily](https://app.tavily.com/) dan salin key ke `TAVILY_API_KEY`. Pencarian memakai [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search). Model contoh OpenRouter dapat dikenai biaya.

```dotenv
ADMIN_AI_ENABLED=true
ADMIN_AI_OPENROUTER_API_KEY=isi_dengan_key_openrouter_admin
ADMIN_AI_OPENROUTER_MODEL=openai/gpt-oss-120b
ADMIN_AI_REGISTRY_ENABLED=true
ADMIN_AI_TAVILY_ENABLED=true
TAVILY_API_KEY=isi_dengan_key_tavily
ADMIN_AI_ATTACHMENTS_ENABLED=false
```

4. Buat ulang container API dari direktori proyek agar Compose membaca ulang nilai `env_file`, lalu masuk dengan MFA ke **Utama → Asisten Anres**. Super admin dapat membuka **Pengaturan → Skill & Agent**. Tanpa konfigurasi OpenRouter, UI menawarkan demo lokal.

```sh
cd /opt/anresstore
docker compose -p anres-production \
  -f infra/compose.production.yaml \
  -f /opt/anresstore-deploy/compose.cloudflare.yaml \
  up -d --no-deps --force-recreate --wait api
```

5. Aktifkan `ADMIN_AI_ATTACHMENTS_ENABLED=true` jika kebijakan data toko mengizinkan file. Analisis umum menerima tiga file teks UTF-8 TXT, MD, CSV, atau JSON dengan total isi maksimal 8.000 karakter. Lampiran analisis diproses oleh model. Masking membantu menutup pola email, nomor telepon, dan token umum. Admin tetap perlu mengeluarkan informasi rahasia dan pribadi dari pesan atau dokumen.

Chat dibatasi enam permintaan per menit per admin dan 24 per jendela harian bersama. Satu chat memakai paling banyak dua request model. Endpoint gagal tertutup saat provider tidak mendukung routing privat, hasil JSON tidak valid, atau database pembatas kuota tidak tersedia. Tidak ada fallback ke model lain.

Tavily menerima maksimal 20 pencarian basic per hari untuk seluruh dashboard. Asisten memakai satu frasa publik yang muncul di pesan terbaru, tanpa riwayat atau lampiran. Contoh **Cari di web dokumentasi VIPayment**. Riset publik dan draf perubahan katalog dijalankan di pesan terpisah.

## Skill dan agent

Versi pengaturan tersimpan di database. Super admin dapat memilih skill backend yang aktif, membatasi role, menulis contoh perintah, menyusun instruksi agent, dan menyunting SOP. Izin dasar dari role admin, kategori, dan cakupan produk masih berlaku. Tes rencana menggunakan pengaturan tersimpan dan hanya menampilkan pilihan langkah model. Riwayat menyimpan label dan status langkah tanpa isi prompt atau file.

Asisten dapat merencanakan maksimal empat langkah berurutan dalam satu pesan. Langkah berikutnya dapat memakai hasil katalog atau status invoice yang sudah diambil. Respons menampilkan riwayat langkah dan tautan hasil pencarian. Rancangan perubahan tetap berada di langkah terakhir dan memerlukan klik konfirmasi.

## Kemampuan

| Tindakan | Sumber Anres | Izin |
|---|---|---|
| Cari produk, lihat promo | Katalog terkelola, sumber provider, dan jadwal promo | `products.read` serta cakupan kategori/produk. Daftar promo butuh akses semua subproduk dalam kategori. |
| Edit harga, nama, deskripsi, visibilitas | Varian yang sudah disimpan | `products.read` dan `products.write` plus cakupan. Mengaktifkan ulang varian VIPayment dilakukan di editor agar pemetaan provider diverifikasi. |
| Cari invoice dan lihat antrean | API daftar transaksi gabungan, termasuk pesanan reguler, joki, dan premium | Izin `orders.read` atau `payments.read` sesuai daftar, dengan cakupan semua layanan. |
| Ringkas pesanan joki atau premium | Daftar pesanan joki dan aplikasi premium | `orders.read` dan cakupan kategori/produk terkait. |
| Ringkas angka laporan dan status sistem | Analitik dan pemeriksaan antrean server | `orders.read` dan `payments.read` plus semua layanan. |
| Lihat antrian CS, buat draf balasan | Hitungan tiket dan situasi anonim dari admin | `support.read` plus semua layanan. |
| Lihat jumlah voucher terbaru | API voucher | Super admin. Kode dan penerima dilihat di dashboard Voucher. |
| Analisis lampiran teks | Dokumen yang dipilih admin | Sesi MFA dan aktivasi lampiran. |
| Analisis harga, duplikat, dan simulasi promo | Varian terkelola dan modal tercatat | `products.read` plus cakupan. |
| Perubahan harga massal | Target margin/markup atau CSV lokal berheader `sku,harga` | `products.read` dan `products.write` plus cakupan. |
| Kronologi invoice dan rekonsiliasi | Status Anres, audit pembayaran, dan detail Tripay | `orders.read` dan `payments.read` plus semua layanan. |
| Omzet dan margin per kategori | Transaksi lunas pada laporan Anres | `orders.read` dan `payments.read` plus semua layanan. |
| SOP, draf konten, dan ringkasan kasus CS | SOP tersimpan, fakta katalog, dan status invoice terverifikasi | Akses skill dan izin sumber yang relevan. |
| Pencarian publik dan riset supplier | Tavily Search | Sesi MFA, aktivasi Tavily, dan izin skill. |

Perintah seperti ubah harga varian menghasilkan draf 15 menit yang terikat ke akun peminta dan versi produk. Panel menampilkan nilai awal dan perubahan. Saat **Terapkan perubahan** ditekan, server memeriksa izin kembali. Database menyimpan perubahan, menandai draf, dan membuat audit dalam transaksi yang sama. Pengulangan permintaan konfirmasi menggunakan hasil tersimpan dan tidak menulis ulang. Perubahan produk setelah pembuatan draf menghasilkan konflik. Keputusan kasir, verifikasi pembayaran, refund, pengelolaan akses, QRIS, pengiriman, dan pengiriman pesan ke pelanggan dikerjakan dari fitur dashboard terkait.

Dari **Katalog & harga → Edit varian → Bantu edit**, **Minta draf AI** mengikat permintaan ke varian yang sedang dibuka. Alur ini hanya tersedia untuk varian yang sudah disimpan.

Untuk CSV, pilih **Draf harga massal**, lampirkan satu CSV dengan maksimal 20 baris, lalu ketik **Siapkan draf harga dari CSV**. Server memproses CSV secara lokal dan membatalkan seluruh batch jika salah satu varian berubah sebelum konfirmasi. Untuk simulasi, coba **Hitung margin produk Mobile Legends di kategori game yang di bawah 10%, lalu siapkan draf harga untuk target margin 15%**.

Model memilih dari daftar tindakan. Server memvalidasi setiap parameter, menyaring data menurut cakupan admin, dan menghitung jawaban operasional dari data Anres. Model tidak menerima isi tiket pelanggan, kontak, saldo provider, atau data gateway dari API internal. Model hanya bisa membuat draf perubahan produk dalam pesan tanpa lampiran. CSV harga mempunyai alur deterministik tersendiri. Chat disimpan selama halaman terbuka. Draf dan riwayat penerapannya tersimpan di database internal.
