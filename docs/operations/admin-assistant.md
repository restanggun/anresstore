# Asisten Anres

Asisten menggunakan sesi admin yang sudah ada. Setiap endpoint asisten memerlukan Supabase MFA level `aal2`, termasuk pada server dev yang melonggarkan MFA untuk fungsi admin lain. Chat dan penerapan draf juga memerlukan origin admin yang terdaftar. Agent membatasi tindakan ke bidangnya. Skill membantu model memilih tindakan dalam cakupan tersebut. Izin tetap diperiksa oleh server.

## Aktivasi

1. Terapkan migrasi `20261120100000_admin_assistant.sql` dan pastikan migrasi admin sebelumnya sudah terpasang.
2. Isi `ADMIN_AI_OPENROUTER_API_KEY` dan `ADMIN_AI_OPENROUTER_MODEL` hanya di lingkungan API. Model harus berupa ID eksplisit yang mendukung keluaran JSON pada endpoint OpenRouter dengan Zero Data Retention dan pengumpulan data ditolak. Periksa tarif dan set batas pengeluaran di key/workspace. Key AI Bantuan publik terpisah.
3. Set `ADMIN_AI_ENABLED=true`, restart API, masuk dengan MFA, lalu buka **Utama → Asisten Anres**. Tanpa konfigurasi, UI menawarkan demo lokal.
4. Untuk lampiran, aktifkan `ADMIN_AI_ATTACHMENTS_ENABLED=true` jika kebijakan data toko mengizinkan. Asisten menerima tiga file teks UTF-8 TXT, MD, CSV, atau JSON dengan total isi maksimal 8.000 karakter. Isi lampiran dikirim saat chat dikirim. Masking membantu menutup pola email, nomor telepon, dan token umum. Admin tetap perlu mengeluarkan informasi rahasia dan pribadi dari pesan atau dokumen.

Chat dibatasi enam permintaan per menit per admin dan 24 per jendela harian bersama. Satu chat memakai paling banyak dua request model. Endpoint gagal tertutup saat provider tidak mendukung routing privat, hasil JSON tidak valid, atau database pembatas kuota tidak tersedia. Tidak ada fallback ke model lain.

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

Perintah seperti ubah harga varian menghasilkan draf 15 menit yang terikat ke akun peminta dan versi produk. Panel menampilkan nilai awal dan perubahan. Saat **Terapkan perubahan** ditekan, server memeriksa izin kembali. Database menyimpan perubahan, menandai draf, dan membuat audit dalam transaksi yang sama. Pengulangan permintaan konfirmasi menggunakan hasil tersimpan dan tidak menulis ulang. Perubahan produk setelah pembuatan draf menghasilkan konflik. Keputusan kasir, verifikasi pembayaran, refund, pengelolaan akses, QRIS, pengiriman, dan pengiriman pesan ke pelanggan dikerjakan dari fitur dashboard terkait.

Dari **Katalog & harga → Edit varian → Bantu edit**, **Minta draf AI** mengikat permintaan ke varian yang sedang dibuka. Alur ini hanya tersedia untuk varian yang sudah disimpan.

Model memilih dari daftar tindakan. Server memvalidasi setiap parameter, menyaring data menurut cakupan admin, dan menghitung jawaban operasional dari data Anres. Model tidak menerima isi tiket pelanggan, kontak, saldo provider, atau data gateway dari API internal. Draf perubahan produk hanya dapat dibuat dalam pesan tanpa lampiran. Chat disimpan selama halaman terbuka. Draf dan riwayat penerapannya tersimpan di database internal.
