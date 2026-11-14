# Pengelolaan katalog dan layanan

Dashboard memakai token bersama di `packages/ui/src/styles.css`: Manrope, biru dan pink. Dropdown admin memakai Radix Select dengan portal yang tetap berada di dalam dialog editor. Dropdown mendukung keyboard dan pembaca layar; layout diuji pada 320, 390, 768, 1024, dan 1440 px.

## Kategori

- `game`: top up. Pilihan awal tetap terkurasi; produk lainnya dapat ditambahkan dari browser VIPayment.
- `prepaid`: pulsa, paket data, token listrik, dan e-wallet. Layanan lain yang memerlukan isian khusus ditangani manual.
- `apps`: aplikasi premium, dengan pemetaan produk induk dan varian.
- `social`: paket layanan sosial. Admin menetapkan jumlah unit per paket sesuai minimum/maksimum provider, lalu harga jual paket. Katalog provider adalah tarif per 1.000 unit; biaya supplier dihitung server. Layanan belum diterbitkan sebelum admin menyimpannya dalam keadaan aktif.
- `tasks`: joki tugas. Nama paket, lingkup, harga, dan ketentuan diatur admin; pengerjaan dilakukan tim setelah pembayaran terverifikasi. Jangan meminta password melalui ringkasan kebutuhan atau catatan pesanan.

## Menambah dan mengedit

Buka Katalog & harga, pilih kategori, lalu Tambah varian untuk layanan sendiri atau Dari VIPayment untuk layanan supplier. Petakan nama dan slug produk induk, nama varian, harga, deskripsi, pemrosesan, dan visibilitas. SKU supplier dipertahankan sebagai identitas. Layanan dengan data tujuan yang belum didukung otomatis ditandai untuk diproses tim admin; tidak dipublikasikan otomatis.

Pencarian varian mencakup seluruh katalog kategori. Varian nonaktif tetap dapat dikelola. Pilihan massal dapat mengaktifkan, menyembunyikan, atau memindahkan varian ke produk induk lain tanpa mengubah status aktifnya. Promo dijadwalkan per varian dan memakai harga server yang sama di katalog dan checkout.

## Pemrosesan pesanan

Checkout menyimpan harga, kode supplier, jumlah paket, mode pemrosesan, dan kontak pelanggan sebagai snapshot. Nilai dari browser tidak menentukan biaya supplier. Sesi dan MFA tetap diperiksa pada setiap akses admin.

Worker hanya dapat mengklaim transaksi live, lunas, dan bermode `vipayment`. Pesanan `manual` tidak dikirim ke API supplier. Operator dengan `orders.write` dapat mengubah pengerjaan manual menjadi diproses, selesai, atau gagal, dengan catatan. Status pembayaran tidak dapat diubah melalui tindakan tersebut. Hasil akhir tidak dibuka ulang dari editor ini. Sosmed yang selesai sebagian masuk tinjauan manual.

## Deployment

Migrasi `20261118040000_catalog_services_and_manual_fulfillment.sql` dan `20261118050000_order_customer_contacts.sql` diperlukan untuk lima kategori dan snapshot kontak. Keduanya diterapkan pada project yang terhubung. Pengaturan katalog memerlukan `ADMIN_CATALOG_ENABLED=true` pada lingkungan server. Perbarui cakupan role lama bila operator memerlukan akses kategori baru.

Build menggunakan origin HTTPS produksi yang telah ditetapkan. Payment gateway yang ada tetap merupakan integrasi Tripay sandbox; jangan menyatakan transaksi live siap dipakai sebelum integrasi pembayaran produksi dikonfigurasi dan diverifikasi. Membaca katalog supplier tidak membuat order supplier. UI ini tidak mengaktifkan pemotongan saldo atau pembayaran live.

Referensi provider: https://vip-reseller.co.id/page/api/game-feature dan https://vip-reseller.co.id/page/api/social-media.
