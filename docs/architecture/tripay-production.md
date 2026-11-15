# Pembayaran Tripay produksi

Checkout memakai endpoint tetap https://tripay.co.id/api dengan TRIPAY_MODE=live. API menolak mode atau endpoint lain. Kredensial merchant hanya disimpan di server.

Harga dan identitas layanan divalidasi di server. Reservasi pembayaran bersifat atomik dan mengikat pemilik serta fingerprint checkout. Nomor invoice ditetapkan database; pembayaran disimpan di payments dan diproyeksikan ke live_transactions.

Status pembayaran berasal dari callback bertanda tangan atau pemeriksaan gateway. Pemenuhan layanan VIPayment hanya berjalan setelah pembayaran lunas, menggunakan klaim atomik agar pesanan tidak terkirim ganda. Layanan manual diproses admin setelah lunas. Status ambigu memerlukan rekonsiliasi.

Invoice akun memerlukan sesi pemilik; invoice guest memakai cookie HttpOnly. URL invoice tidak memberi hak akses dengan sendirinya.

Terapkan seluruh migrasi berurutan hingga 20261118151000_profile_permissions.sql sebelum memasang API versi ini. Rangkaian migrasi mengganti nama tabel pembayaran, menghapus catatan nonproduksi berdasarkan payment_mode, memvalidasi batasan produksi, dan menyelaraskan izin profil. Hentikan API dan worker lama selama perubahan schema; buat backup sebelum migrasi.

Isi infra/api.env.example dengan kredensial produksi dan jalankan node scripts/check-production-env.mjs. Ikuti [runbook VPS](../operations/vps-deployment.md). Perubahan repository ini tidak memasang aplikasi ke VPS atau mengisi kredensial merchant.


## Memilih mode pembayaran

Atur `TRIPAY_MODE=sandbox` untuk uji coba atau `TRIPAY_MODE=live` untuk pembayaran sungguhan di `apps/api/.env`. Kosongkan `TRIPAY_BASE_URL` agar endpoint mengikuti mode secara otomatis. Isi API key, private key, dan kode merchant sesuai mode; kredensial sandbox dan live berbeda. Restart API setelah mengubah env.

Terapkan migrasi `20261118160000_restore_sandbox_payments.sql` sebelum memakai sandbox. Mode disimpan pada invoice, pembacaan API dipisahkan per mode, dan transaksi sandbox secara default tidak dikirim ke supplier sungguhan. Checkout menampilkan penanda sandbox. Semua kategori memakai `PaymentCheckout` dan `PaymentMethods` yang sama dengan grup metode yang dapat dibuka melalui chevron.


Invoice baru memakai format `ARNS-YYMMDD-XXXXXXXXXXXXXX` (26 karakter). Invoice lama tetap valid dan tidak diubah, termasuk referensi yang sudah dikirim ke Tripay.

### Mengirim produk asli dari Tripay sandbox

Terapkan migrasi `20261118170000_short_invoices_sandbox_fulfillment.sql`. Set `VIPAYMENT_SANDBOX_FULFILLMENT_ENABLED=true` bersama `VIPAYMENT_FULFILLMENT_ENABLED=true` dan kredensial VIPayment asli, lalu restart API. Pembayaran tetap simulasi, tetapi order VIPayment nyata dan memotong saldo. Ini juga memproses invoice sandbox lunas yang masih `ready`; gunakan tujuan produk yang benar sebelum mengaktifkan.

Default opsi sandbox adalah `false`. Semua order tetap melalui pemeriksaan status Tripay, klaim atomik, batas pengeluaran bersama, dan perlindungan kirim ulang. Mematikan opsi menghentikan pengiriman baru; status order yang sudah dikirim tetap dipantau.
