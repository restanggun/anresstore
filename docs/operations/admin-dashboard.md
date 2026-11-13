# Dashboard dan cakupan website

Dashboard `apps/admin` memakai API `/v1/admin`, database yang sama dengan storefront, serta autentikasi Supabase milik web. Tidak ada data contoh yang dianggap transaksi nyata.

## Aktivasi

1. Jalankan migrasi `supabase/migrations/20261113120000_admin_catalog.sql` setelah migrasi akun, orders, support_requests, dan sandbox_payments.
2. Di env API, isi `ADMIN_USER_IDS` dengan UUID akun administrator Supabase yang dipercaya (pisahkan koma). Identitas diverifikasi ulang lewat `/auth/v1/user`; metadata pengguna tidak dapat memberi akses admin.
3. Isi konfigurasi Supabase server yang sudah dipakai web: URL, publishable/anon key, secret/service role key. Jangan letakkan secret di env publik dashboard.
4. Aktifkan `ADMIN_CATALOG_ENABLED=true` setelah migrasi berhasil. Default false mempertahankan katalog lama. Bila aktif dan tabel tidak tersedia, API menampilkan error, bukan mengabaikan pengaturan admin.
5. Pastikan `CORS_ORIGINS` mencakup origin dashboard dan web; dashboard memakai `NEXT_PUBLIC_API_URL` serta `NEXT_PUBLIC_WEB_URL`. Login lewat web, lalu buka dashboard. Sesi kedaluwarsa perlu login kembali. Produksi harus memakai origin API yang dapat menerima cookie sesi dari kedua aplikasi; cross-site cookie default SameSite=Lax tidak cukup. Gunakan domain yang satu site atau reverse proxy API.
6. Jalankan ulang API dan dashboard setelah mengubah env. Uji akun tanpa izin (403), tanpa sesi (401), lalu akun administrator.

## Perilaku

- Pesanan akun/simulasi berasal dari `orders`; pembayaran Tripay berasal dari `sandbox_payments`. Keduanya punya tampilan terpisah, paginasi 50 catatan, pencarian/filter pada halaman aktif, dan detail.
- Status pembayaran hanya mengikuti mekanisme verifikasi gateway yang sudah ada. Admin tidak dapat menandai pembayaran lunas dari browser. Data akses tamu, hash permintaan, dan detail gateway tidak dikirim melalui daftar admin.
- Produk manual/provider bebas tersimpan di `managed_products`. Provider+category+provider_code unik. Kode publik provider selain VIPayment memakai `managed.<UUID>` sehingga SKU sama dari provider berbeda tidak berbenturan. Identitas provider tidak membuat koneksi API otomatis.
- Untuk VIPayment, pilih varian dari katalog web di dashboard lalu simpan pengaturan dengan kode SKU yang sama. Pengaturan menggantikan atribut/harga dasar; nonaktif menyembunyikan SKU. Harga promo web yang masih aktif tetap berlaku di atas harga dasar admin.
- Produk kategori game, prepaid/PPOB, dan apps dibaca melalui endpoint katalog yang juga dipakai checkout untuk validasi harga server. Pengaturan dibaca dari database setiap permintaan katalog; buka ulang/muat ulang web untuk melihat perubahan. Feed asli provider masih memiliki cache 60 detik. Tanpa kredensial VIPayment, mode katalog admin dapat menayangkan produk manual. Bila kredensial VIPayment ada tetapi provider gagal, katalog tetap menampilkan error koneksi sesuai perilaku fail-closed sebelumnya.
- Bantuan membaca `support_requests` dan dapat memperbarui status internal. Fitur mengirim balasan CS belum tersedia di web.
- Tabel cakupan fitur tersedia pada setiap halaman dashboard: format tugas/booster, produksi, fulfillment otomatis, editor konten/promo, manajemen pelanggan/peran yang belum ada dijelaskan secara eksplisit.

## Verifikasi

`npm run typecheck --workspace=@anres/admin`

`npm run test --workspace=@anres/api`

Tes admin mencakup penolakan akses, pembatasan origin penulisan, validasi harga/kategori, data yang diizinkan tersimpan, paginasi, penyembunyian data akses pembayaran, isolasi kode provider, katalog bersama storefront, dan status bantuan. Tes memakai respons database/auth terkontrol; bukan bukti migrasi atau integrasi akun produksi sudah aktif.

## Hasil pemeriksaan lokal

Build produksi admin dan typecheck berhasil. Seluruh 41 tes API awal lulus, kemudian 6 tes khusus admin lulus setelah penambahan pemeriksaan identitas SKU. Browser memverifikasi navigasi desktop/mobile, tombol penambahan produk terkunci tanpa izin, pesan konfigurasi, dan tidak ada overflow horizontal pada lebar 390 px. Screenshot ada di `output/playwright/admin-connected-desktop.png` dan `admin-connected-mobile.png`.

Pemeriksaan layanan lokal mendapati katalog provider mengembalikan 503. Tabel `managed_products` pada database terkonfigurasi belum ada. Karena itu publikasi katalog admin belum diaktifkan dan integrasi database penuh belum diverifikasi. Akun administrator yang dipilih pengguna sudah dikonfigurasi di `.env` lokal yang diabaikan Git; API meminta sesi login (401) ketika dibuka tanpa cookie.

Helper `node scripts/configure-admin.mjs <email>` mencari akun terverifikasi melalui API admin Supabase, menambahkan UUID-nya ke allowlist lokal, dan memeriksa keberadaan tabel produk. Helper tidak membuat akun, mengubah password, atau menerapkan migrasi. Perubahan env membutuhkan restart API.

Pemeriksaan lanjutan menemukan VIPayment menolak kedua IP keluar yang diuji (IPv6 `2404:c0:b301:8eb2:caf:682b:500a:444`, IPv4 `182.8.211.245`) dengan pesan IP tidak diizinkan. IP ini adalah hasil pemeriksaan saat pengerjaan, dapat berubah mengikuti jaringan; atur whitelist untuk IP keluar server deployment yang sebenarnya. Jangan menganggap IP komputer pengembangan sebagai IP produksi.

Pengujian formulir dengan route fixture browser berhasil mengisi data produk, mengirim harga/flag aktif/kode SKU yang benar, menampilkan konfirmasi simpan, dan mencari daftar produk. Tidak ada data fixture ditulis ke database. Route fixture dihapus setelah pengujian dan halaman dikembalikan ke API asli.
