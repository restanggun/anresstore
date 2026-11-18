# Pengelolaan katalog dan layanan

Dashboard memakai token bersama di `packages/ui/src/styles.css`: Manrope, biru dan pink. Dropdown admin memakai Radix Select dengan portal yang tetap berada di dalam dialog editor. Dropdown mendukung keyboard dan pembaca layar; layout diuji pada 320, 390, 768, 1024, dan 1440 px.

## Kategori

- `game`: top up. Pilihan awal tetap terkurasi; produk lainnya dapat ditambahkan dari browser VIPayment.
- `prepaid`: pulsa, paket data, token listrik, dan e-wallet. Layanan lain yang memerlukan isian khusus ditangani manual.
- `apps`: aplikasi premium, dengan pemetaan produk induk dan varian.
- `social`: paket layanan sosial. Admin menetapkan jumlah unit per paket sesuai minimum/maksimum provider, lalu harga jual paket. Katalog provider adalah tarif per 1.000 unit; biaya supplier dihitung server. Layanan belum diterbitkan sebelum admin menyimpannya dalam keadaan aktif.
- `tasks`: Joki Tugas. Atur model tarif dan lingkup per varian. Paket dengan tarif langsung masuk checkout, dan pengerjaan dimulai setelah pembayaran terverifikasi. Paket custom menerima brief lewat Tiket CS.

## Menambah dan mengedit

Buka Katalog & harga, pilih kategori, lalu Tambah varian untuk layanan sendiri atau Dari VIPayment untuk layanan supplier. Petakan nama dan slug produk induk, nama varian, harga, deskripsi, pemrosesan, dan visibilitas. SKU supplier dipertahankan sebagai identitas. Layanan dengan data tujuan yang belum didukung otomatis ditandai untuk diproses tim admin; tidak dipublikasikan otomatis.

Pencarian varian mencakup seluruh katalog kategori. Varian nonaktif tetap dapat dikelola. Pilihan massal dapat mengaktifkan, menyembunyikan, atau memindahkan varian ke produk induk lain tanpa mengubah status aktifnya. Promo dijadwalkan per varian dan memakai harga server yang sama di katalog dan checkout.

## Tarif Joki Tugas

Migrasi menambahkan draf Makalah, Artikel, Esai, Laporan, PPT, Desain Grafis (poster, flyer, konten), Editing Video CapCut, Website, dan Aplikasi Android. Dari **Katalog & harga** pilih kategori Joki Tugas dan buka varian. Simpan varian untuk membuat produk baru, lalu atur **Tarif Joki Tugas**.

- Pilih satuan lembar, slide, menit, atau item. Isi tarif per satuan, batas jumlah, tenggat standar, biaya percepatan, dan revisi tambahan. Biaya dasar kosong memakai harga dasar varian. Isi 0 untuk harga murni per satuan.
- Pilih penawaran custom untuk menerima brief di **Room chat CS**. Penawaran dan diskusi berjalan di tiket privat. Varian custom tidak membuat invoice otomatis, dan harga placeholder tidak ditampilkan di toko.
- Tinjau tarif sebelum menyalakan **Tampilkan di website**. Draf disimpan nonaktif. Varian tarif langsung tanpa harga positif belum dapat ditampilkan. Satuan yang dipakai pelanggan disimpan bersama pesanan, sehingga perubahan tarif berikutnya tidak mengubah faktur lama.

## Pemrosesan pesanan

Checkout menyimpan harga, kode supplier, jumlah paket, mode pemrosesan, dan kontak pelanggan sebagai snapshot. Nilai dari browser tidak menentukan biaya supplier. Sesi dan MFA tetap diperiksa pada setiap akses admin.

Worker hanya dapat mengklaim transaksi live, lunas, dan bermode `vipayment`. Pesanan `manual` tidak dikirim ke API supplier. Operator dengan `orders.write` dapat mengubah pengerjaan manual menjadi diproses, selesai, atau gagal, dengan catatan. Status pembayaran tidak dapat diubah melalui tindakan tersebut. Hasil akhir tidak dibuka ulang dari editor ini. Sosmed yang selesai sebagian masuk tinjauan manual.

## Deployment

Migrasi `20261118040000_catalog_services_and_manual_fulfillment.sql` dan `20261118050000_order_customer_contacts.sql` diperlukan untuk lima kategori dan snapshot kontak. Keduanya diterapkan pada project yang terhubung. Pengaturan katalog memerlukan `ADMIN_CATALOG_ENABLED=true` pada lingkungan server. Perbarui cakupan role lama bila operator memerlukan akses kategori baru.

Build menggunakan origin HTTPS produksi. Checkout memakai Tripay produksi dengan harga yang divalidasi server; pemenuhan pesanan berjalan setelah pembayaran terverifikasi. Membaca katalog supplier tidak membuat pesanan supplier.

Referensi provider: https://vip-reseller.co.id/page/api/game-feature dan https://vip-reseller.co.id/page/api/social-media.
