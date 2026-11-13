# Katalog VIPayment

## Tampilan dan promo

Halaman utama `/katalog` mempertahankan lima kartu kategori seperti section layanan pada landing. Tiap kartu membuka halaman kategori dan tiap produk tetap memiliki URL serta formulirnya sendiri. Tab pengelompokan berada di dalam pilihan nominal, bukan menggantikan lima kartu kategori utama.

Top up game dibatasi ke 20 judul di `featured-games.ts`. Kurasi memadukan [chart App Store Indonesia](https://apps.apple.com/id/iphone/charts/6014?chart=top-free), [chart Google Play Indonesia yang dihimpun AppsXray](https://appsxray.com/charts?category=GAME&chart=grossing&country=ID), ketersediaan VIPayment, dan layanan PC yang dipertahankan. Ini daftar pilihan toko, bukan klaim peringkat mutlak 1–20 lintas platform. Game populer yang hanya tersedia melalui metode login atau voucher tidak dipaksakan masuk alur top up ID.

`catalog-promotions.ts` menampung fixture flash sale sementara, sebelum dikelola dari dashboard. Promo contoh untuk Mobile Legends, Free Fire, dan Canva memakai jadwal absolut 13–20 November 2026 (WIB). Harga dibulatkan ke atas per Rp100, sehingga persentase penghematan yang ditampilkan mengikuti selisih harga sebenarnya. Tidak ada countdown yang diulang setiap kunjungan.

Promo diterapkan setelah membaca cache, sehingga promo yang habis tidak tertahan oleh TTL katalog. Ringkasan kartu dan varian memakai sumber harga serta waktu yang sama. Browser mengikuti `serverTime` dan mengembalikan tampilan harga normal saat batas waktu terlewati.

Kartu promo menyertakan nama nominal dan `offerCode`; tautan `?pilihan=...` memilih SKU yang sama pada halaman detail. Jika nominal paling kecil tidak mendapat diskon akibat pembulatan, kartu menampilkan nominal termurah yang benar-benar mendapat promo. Harga normal minimum dipertahankan terpisah untuk digunakan setelah promo berakhir.

Informasi pengguna memakai `displayName` dan `section`; kode layanan serta nama penyedia tetap dipertahankan untuk integrasi. Nominal dikelompokkan ke tab (Diamond, Membership, mata uang lain, durasi aplikasi, atau operator PPOB). Alternatif identik pada kelompok/region dan ketentuan yang sama diringkas ke pilihan termurah; ketentuan berbeda tidak digabung.

Kredensial berada di `apps/api/.env`: `VIPAYMENT_API_ID` dan `VIPAYMENT_API_KEY`. Signature MD5 dibuat oleh API. Kredensial, signature, dan harga modal tidak dikirim ke browser.

Endpoint storefront:

- `GET /v1/catalog/game`: top up game dengan kelompok layanan yang sudah dipetakan.
- `GET /v1/catalog/prepaid`: pulsa, paket internet, token PLN, saldo e-money.
- `GET /v1/catalog/apps`: aplikasi dari endpoint game-feature VIPayment.

Permintaan penyedia mengikuti [API game-feature](https://vip-reseller.co.id/page/api/game-feature) dan [API prepaid](https://vip-reseller.co.id/page/api/prepaid). Identitas varian adalah `code` asli; nama, kelompok penyedia, merek, keterangan, dan harga jual dipertahankan terpisah. UI tidak lagi mencocokkan varian memakai substring nama.

Pemetaan ada di `apps/api/src/catalog/catalog-mapping.ts`. `Mobile Legends A/B`, Free Fire reguler/Max, dan alias PUBG dipetakan ke produk yang sama sambil mempertahankan kelompok dan kode layanan. Game lain menggunakan daftar kelompok yang ditinjau. Aplikasi memakai daftar kelompok tersendiri. PPOB menggunakan `type`, termasuk `saldo-emoney`, bukan tebakan dari nama. Tipe tak dikenal, gift, joki, via login/vilog, voucher, dan regional game yang belum dipetakan tidak ditampilkan pada alur top up biasa. Penambahan kelompok baru perlu meninjau kebutuhan tujuan serta ketentuan layanan sebelum menambah mapping dan tes.

Hanya status `available`, kode valid yang unik, dan harga basic positif yang ditampilkan. Harga basic dipakai secara konservatif; markup mengikuti aturan proyek: 25% untuk modal <10.000, 20% <30.000, 15% <60.000, 10% <100.000, selebihnya 5%, dibulatkan ke atas per Rp100. Ini harga jual, bukan harga modal VIPayment. Keterangan penyedia dirender sebagai teks biasa.

Cache server berlaku 60 detik per kategori, permintaan bersamaan digabung, timeout 15 detik, dan kegagalan diberi jeda 10 detik. Cache kedaluwarsa tidak disajikan saat penyedia gagal. Status katalog bukan jaminan stok maupun harga pada waktu pembayaran.

## Verifikasi

Jalankan dari root proyek:

```sh
npm run test --workspace=@anres/api
node scripts/check-vipayment-catalog.mjs
```

Perintah kedua memerlukan hasil build API (dihasilkan perintah tes), koneksi internet, dan whitelist IP keluar server di VIPayment. Diagnostik hanya membaca layanan dan mencetak jumlah produk; tidak membuat pesanan. Bila pesan `IP ... tidak diizinkan` muncul, whitelist IP yang disebut penyedia. IP development dan production dapat berbeda.

Katalog game, PPOB, dan aplikasi memakai data asli. Booster media sosial dan format tugas masih simulasi. Keranjang, checkout, pembayaran, dan fulfillment juga masih simulasi. Sebelum mengaktifkan transaksi nyata, validasi ulang SKU, tujuan, stok, dan harga di server serta simpan identitas provider sebagai field tersendiri; jangan memakai harga browser atau mengurai teks `details` untuk membuat transaksi. Saat ini kode layanan ikut dicantumkan dalam detail pesanan simulasi untuk keterlacakan.
