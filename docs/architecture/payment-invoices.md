# Invoice pembayaran

Nomor publik memakai `ARNS-{SUBPRODUK}-{PRODUK}-{YYYYMMDD}-{UNIK}`.
Contoh: `ARNS-FF12S13-FREEFIRE-20261115-0123456789ABCDEF`.

Database membuat nomor saat reservasi, sebelum request gateway. Kode subproduk
berasal dari kode layanan varian; kode produk berasal dari slug produk katalog
server. Keduanya dinormalisasi menjadi huruf kapital/angka, maksimal 12 karakter.
Tanggal mengikuti Asia/Bangkok (UTC+7); akhiran acak 16 karakter dilindungi unique
constraint. Identitas ini merupakan snapshot dan tidak berubah saat harga/katalog,
status, callback, atau pemrosesan berubah. UUID tetap menjadi primary/foreign key.

`payments.invoice_number` dan `live_transactions.invoice_number` sama; proyeksinya
berada dalam transaksi reservasi yang sama. API publik mengirim `invoiceNumber`;
admin, detail, pencarian, salin nomor, riwayat, dan URL invoice memakai nomor itu.
Mengetahui nomornya tidak memberi hak akses: invoice tetap memerlukan sesi pemilik.

Request gateway baru memakai nomor ARNS sebagai `merchant_ref`, dengan
`return_url=/invoice/{invoiceNumber}`. Invoice lama mendapat nomor ARNS saat migrasi
tetapi `merchant_ref` gateway yang sudah terkirim tetap dipertahankan, termasuk
permintaan yang hasilnya belum pasti. Callback dan rekonsiliasi memakai snapshot
`merchant_ref`, sehingga invoice lama tidak dikirim ulang.

Checkout mengalihkan pembayaran pending ke URL HTTPS checkout Tripay yang telah
divalidasi. Riwayat browser menyimpan invoice sebagai tujuan kembali. Transaksi
unknown, terminal, atau dalam tinjauan membuka invoice, bukan mengirim pembayaran
baru. Halaman invoice tidak menyimpulkan lunas dari URL kembali; status berasal
dari verifikasi API dan diperbarui saat tab aktif kembali serta secara berkala.

UI tiket memakai token desain Anres, langkah 1–4, panel rincian, ringkasan biaya,
salin nomor, dan tampilan cetak. Nominal/biaya yang belum terverifikasi tidak
ditampilkan sebagai total final. Kontrol pembayaran tidak muncul setelah lunas.

Validasi: `npm run test:db`, `npm run test:web`, `npm test --workspace=@anres/api`,
`npm run test:invoice-upgrade`, serta typecheck web/admin. Tes database mencakup format, tanggal, nomor unik,
idempotensi, proyeksi, dan imutabilitas. Tes API mencakup ARNS pada request,
return URL, pencarian milik pemilik, dan callback terverifikasi. Pengujian visual
di `output/playwright/invoice-visual.js` memakai fixture dan tidak membuat transaksi.

## Integrasi sandbox terpisah

`scripts/integration/checkout-harness.mjs` menjalankan controller produksi dengan
PostgreSQL sementara dan transport yang hanya dapat mengirim request ke
`https://tripay.co.id/api-sandbox`. Tidak ada worker supplier dan tidak ada akses
Supabase. Kode/config utama tetap live; penamaan mode di database sementara hanya
untuk menjalankan aturan controller yang sama.

Siapkan env sandbox terpisah (jangan commit secret), jalankan build API dan katalog
lokal pada port 4000, lalu arahkan tunnel uji ke port 4100. Jalankan:

```sh
node scripts/integration/checkout-harness.mjs https://TUNNEL.trycloudflare.com/v1/payments/callback apps/api/.env.sandbox
```

Env wajib memiliki `TRIPAY_BASE_URL=https://tripay.co.id/api-sandbox` dan kredensial
sandbox; harness menolak env live. Arahkan permintaan browser uji `/v1/payments/*`
ke port 4100, termasuk saat kembali dari gateway. `/test/status` hanya berisi
nomor invoice dummy, status, referensi gateway dan jumlah create/callback.
Simulasi PAID harus dilakukan melalui Simulator merchant Tripay; fixture UI bukan
bukti lunas sungguhan. Hentikan proses dan tunnel setelah pengujian selesai.
