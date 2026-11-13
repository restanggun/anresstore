# Pembayaran Tripay sandbox

Checkout langsung produk VIPayment (game, PPOB, aplikasi) memakai API Tripay sandbox. Keranjang dan kategori dengan harga contoh tetap menggunakan simulasi lama. Pembayaran sandbox tidak memanggil endpoint pemesanan VIPayment.

## Setup lokal

1. Isi `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE`, `TRIPAY_BASE_URL=https://tripay.co.id/api-sandbox` di `apps/api/.env`.
2. Isi `SUPABASE_SECRET_KEY` di server; jangan gunakan key ini di frontend.
3. Jalankan migrasi pembayaran melalui SQL Editor dashboard Supabase secara berurutan: `20261113080000_sandbox_payments.sql`, `20261113120000_payment_security.sql`, dan `20261113130000_payment_recovery_lease.sql`. Jangan jalankan ulang file yang sudah diterapkan. CLI tidak diperlukan. Tabel dilindungi RLS dan hanya service role dapat membacanya.
4. Jalankan API pada port 4000, lalu `powershell -File scripts/start-payment-tunnel.ps1`. Binary resmi cloudflared berada di `output/cloudflared.exe`.
5. Isi `TRIPAY_CALLBACK_URL=https://<tunnel>.trycloudflare.com/v1/payments/callback`. URL quick tunnel berubah setelah proses dimulai ulang. API lokal membaca env saat startup, jadi restart API sesudah mengubah env.
6. Isi `TRIPAY_RETURN_URL=http://localhost:3000`. Server membentuk URL kembali `/pembayaran/<id>` dari origin ini.
7. Jalankan `npm run build --workspace=@anres/api`, lalu `node scripts/check-tripay-sandbox.mjs` untuk memeriksa kredensial dan channel aktif tanpa membuat transaksi.
8. Buka produk katalog, pilih nominal, lanjut checkout, isi nama/email/telepon, dan pilih channel. Buka halaman pembayaran Tripay sandbox untuk kode VA/QR/instruksi lengkap. Gunakan simulator merchant Tripay untuk mengubah status, lalu periksa status di aplikasi.

Checkout menghitung ulang harga dari katalog VIPayment. IP publik server/laptop harus terdaftar pada whitelist API VIPayment; perubahan jaringan dapat mengubah IP tersebut. Jika katalog menolak IP, checkout berhenti sebelum membuat transaksi Tripay. Periksa dengan `node scripts/check-vipayment-catalog.mjs`, perbarui whitelist di dashboard VIPayment, lalu coba lagi.

Dokumentasi resmi: https://tripay.co.id/developer

## Endpoint

- `GET /v1/payments/channels`: channel aktif beserta minimum/maksimum nominal.
- `POST /v1/payments/session`: wajib Origin yang diizinkan dan `credentials: include`. Membuat cookie HttpOnly bagi guest atau memverifikasi sesi akun; tidak mengembalikan token guest ke JavaScript.
- `POST /v1/payments/transactions`: `{id,source,code,target,method,name,email,phone,expectedAmount}` dengan `credentials: include`. ID UUID v4 harus digunakan kembali untuk retry permintaan yang sama. Harga diambil dari katalog server dan dibandingkan dengan harga yang disetujui pelanggan; harga browser tidak menentukan nominal tagihan. Respons dapat menunjuk ID invoice aktif yang sudah ada; gunakan ID dari respons.
- `GET /v1/payments/transactions/:id`: `credentials: include`, cookie guest yang cocok atau sesi akun pemilik. Hanya invoice lama tanpa pemilik sesi/akun yang masih dapat memakai Bearer capability lama. Status direkonsiliasi dengan provider menggunakan lease bersama.
- `POST /v1/payments/callback`: membutuhkan signature HMAC atas raw body dan event `payment_status`. Callback diverifikasi kembali ke detail Tripay, termasuk referensi, nominal, channel, dan status.

Checkout baru memakai sesi guest yang dibuat server melalui cookie HttpOnly, atau kepemilikan akun yang diverifikasi ke Supabase. Browser tidak menyimpan token guest baru di localStorage. URL invoice sendiri tidak memberi akses. Invoice akun hanya dapat dibaca pemilik akun; invoice guest memerlukan cookie browser yang sama. Invoice sandbox lama masih mendukung capability lama hanya untuk record tanpa pemilik sesi/akun. Riwayat invoice simulasi tetap terpisah.

Database menyimpan reservasi atomik sebelum menghubungi Tripay. Klik ganda/retry dan request identik dengan ID berbeda untuk pemilik yang sama tidak mengirim pembayaran aktif kedua. Jika create timeout, status `unknown` tidak dikirim ulang otomatis. Worker mencari transaksi berdasarkan merchant invoice dan memverifikasi detailnya; callback juga dapat memulihkan referensi yang belum tersimpan. Hasil yang belum pasti atau memiliki beberapa kecocokan memerlukan pemeriksaan manual. Status terminal tidak diturunkan oleh callback terlambat. Lihat [review keamanan](payment-security.md) untuk kontrol, pengujian, dan batas kesiapan produksi.

Kredensial produksi ditolak. Saat beralih ke pembayaran sungguhan diperlukan rollout terpisah termasuk otorisasi akun, fulfillment, rekonsiliasi otomatis, dan pengujian end-to-end pada hosting permanen.
