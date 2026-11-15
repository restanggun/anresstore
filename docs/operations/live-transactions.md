# Transaksi live di VPS

Konfigurasi repository memakai Tripay production sebagai payment gateway dan
VIPayment sebagai pemasok produk. Template live: `infra/api.env.example`.
Setup mesin, SSH, DNS dan kredensial dilakukan pemilik deployment.

## Konfigurasi

Salin template ke `apps/api/.env.production`, isi seluruh secret kosong, dan
batasi akses file dengan `chmod 600`. Gunakan kredensial Tripay merchant
production. VIPayment memerlukan API ID, API key, saldo, dan IP egress VPS
yang sesuai pengaturan provider. Aktifkan channel pembayaran merchant.
Daftarkan callback `https://api.anresstore.site/v1/payments/callback` di Tripay.

Setelah backup dan pemeriksaan history database, terapkan migrasi yang belum
diterapkan secara berurutan. Semua migrasi dalam `supabase/migrations` merupakan
bagian release, termasuk payment modes, fulfillment guard, spending limits dan
invoice numbers. Jangan menjalankan reset database hosted.

```sh
npm ci
node scripts/check-production-env.mjs apps/api/.env.production
docker compose -f infra/compose.production.yaml config --quiet
docker compose -f infra/compose.production.yaml build
docker compose -f infra/compose.production.yaml up -d --wait
```

Compose memasok origin HTTPS, CORS dan IP proxy tepercaya. Hanya Caddy membuka
port publik. Secret API tidak masuk image atau bundle frontend. API menolak
startup jika endpoint/mode, callback/return URL, kredensial wajib atau konfigurasi
rekonsiliasi tidak sesuai. Production mewajibkan mode live dan endpoint production.

## Alur transaksi

1. Checkout memuat SKU dan harga server, tujuan serta zona terpisah; identitas
   invoice berasal dari sesi akun atau cookie guest HttpOnly.
2. Database mereservasi invoice secara atomik. Hanya pemenang reservasi mengirim
   request pembuatan pembayaran Tripay. Respons yang hilang direkonsiliasi,
   tidak otomatis dikirim ulang.
3. Callback memverifikasi HMAC atas raw body dan event, kemudian membaca detail
   transaksi langsung dari Tripay. Referensi, invoice, SKU, nominal, jumlah,
   channel dan fee harus cocok sebelum status pembayaran disimpan.
4. Trigger database memproyeksikan pembayaran ke order. Hanya order mode live
   yang sudah paid, tidak memerlukan review dan berjenis VIPayment boleh diklaim.
5. Klaim supplier dan reservasi anggaran tersimpan atomik. Worker mengirim satu
   request order, menyimpan referensi VIPayment, lalu polling sampai selesai.
   Timeout ambigu menjadi unknown untuk pemeriksaan operator, tanpa pembelian ulang.

Default anggaran supplier: Rp250.000/order, Rp500.000/jam, Rp2.000.000/24 jam,
dan 10 order/jam. Kelola melalui konfigurasi fulfillment berwenang; order yang
melewati limit ditahan untuk review. Ini anggaran biaya pemasok, bukan harga jual.

## Verifikasi setelah deploy

Lakukan satu transaksi live bernilai kecil: cocokkan nominal dan fee invoice,
bayar, pastikan PAID dari Tripay, satu referensi supplier, tujuan yang benar,
dan status produk selesai. Kirim ulang callback sah yang sama untuk memastikan
tidak ada pembelian kedua. Periksa akses invoice akun lain ditolak, restart API,
dan pastikan worker melanjutkan polling order yang sedang diproses.

Aktifkan monitor pada `infra/monitor` sesuai `transaction-operations.md`.
Untuk menghentikan pembelian baru, set `VIPAYMENT_FULFILLMENT_ENABLED=false`
dan recreate API; pertahankan `VIPAYMENT_STATUS_POLLING_ENABLED=true` dan
`PAYMENT_RECONCILIATION_ENABLED=true`. Jangan memakai pergantian mode Tripay
sebagai tombol pause. Refund pelanggan tetap harus diselesaikan operator;
status supplier failed tidak berarti dana pelanggan sudah dikembalikan.

Verifikasi repository: test API, test web, typecheck dan replay migrasi disposable.
Build image Linux serta transaksi melalui domain publik dilakukan pada VPS;
kelulusan test repository tidak menyatakan keduanya sudah dijalankan.

Kontrak provider: [Tripay](https://tripay.co.id/developer),
[VIPayment game](https://vip-reseller.co.id/page/api/game-feature).
