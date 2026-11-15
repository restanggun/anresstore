# Pembayaran Tripay produksi

Checkout memakai endpoint tetap https://tripay.co.id/api dengan TRIPAY_MODE=live. API menolak mode atau endpoint lain. Kredensial merchant hanya disimpan di server.

Harga dan identitas layanan divalidasi di server. Reservasi pembayaran bersifat atomik dan mengikat pemilik serta fingerprint checkout. Nomor invoice ditetapkan database; pembayaran disimpan di payments dan diproyeksikan ke live_transactions.

Status pembayaran berasal dari callback bertanda tangan atau pemeriksaan gateway. Pemenuhan layanan VIPayment hanya berjalan setelah pembayaran lunas, menggunakan klaim atomik agar pesanan tidak terkirim ganda. Layanan manual diproses admin setelah lunas. Status ambigu memerlukan rekonsiliasi.

Invoice akun memerlukan sesi pemilik; invoice guest memakai cookie HttpOnly. URL invoice tidak memberi hak akses dengan sendirinya.

Terapkan seluruh migrasi berurutan hingga 20261118151000_profile_permissions.sql sebelum memasang API versi ini. Rangkaian migrasi mengganti nama tabel pembayaran, menghapus catatan nonproduksi berdasarkan payment_mode, memvalidasi batasan produksi, dan menyelaraskan izin profil. Hentikan API dan worker lama selama perubahan schema; buat backup sebelum migrasi.

Isi infra/api.env.example dengan kredensial produksi dan jalankan node scripts/check-production-env.mjs. Ikuti [runbook VPS](../operations/vps-deployment.md). Perubahan repository ini tidak memasang aplikasi ke VPS atau mengisi kredensial merchant.
