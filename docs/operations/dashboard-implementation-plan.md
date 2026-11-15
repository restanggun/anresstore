# Dashboard operasional

Lingkup: produk dan promo, akun pelanggan, transaksi produksi, penanganan pesanan, tiket dan percakapan CS, laporan dari agregasi database.

## Arah UI

Pertahankan Manrope, putih #ffffff, teks #17191c, biru #a9ddf7, pink #ffb5d5, dan garis #e3e7eb. Navigasi tetap di kiri; isi rata kiri. Ringkasan mengutamakan antrean kerja, lalu grafik batang transaksi harian, komposisi status, dan produk terlaris. Tabel dan panel detail digunakan untuk operasional. Tidak ada metrik palsu atau statistik dari satu halaman data.

## Kriteria integrasi

- Semua perubahan memakai API dan database yang sama dengan storefront.
- Pembayaran hanya berubah melalui verifikasi gateway. Pengiriman tidak boleh dikirim ulang ketika hasil provider ambigu.
- Percakapan customer harus terikat identitas terverifikasi; email formulir tamu bukan bukti kepemilikan.
- Hak baca/tulis, MFA, origin, validasi, audit, pagination, dan konflik pembaruan berlaku di server.
- Migrasi, tes API, typecheck, build, dan pemeriksaan browser harus diverifikasi sebelum menyatakan siap produksi.

## Temuan audit awal

Pengelolaan produk dan promo tersedia. Dashboard belum menyediakan pengelolaan pelanggan, balasan CS, atau agregasi laporan. `live_transactions` dan worker pemenuhan tersedia tetapi belum menjadi alur utama dashboard. Konfigurasi lingkungan dan database produksi belum diverifikasi.
