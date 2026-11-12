# Arsitektur fondasi

Web (3000) dan admin (3001) menggunakan Next.js App Router. API NestJS (4000)
menjadi tempat aturan bisnis. Supabase langsung melalui supabase-js, tanpa Prisma.
Frontend kelak menggunakan publishable key dan Auth; role/ownership tetap diperiksa
di backend. Service role key tidak boleh masuk bundle browser.

Saat ini hanya `GET /v1/health` tersedia. Endpoint ini mengukur liveness proses,
bukan konektivitas database. Tidak ada login, tabel domain, atau transaksi aktif.
Kontrak bersama berupa declaration TypeScript, UI berupa source yang ditranspile
Next.js. Tipe database bootstrap kosong dan harus dihasilkan ulang setelah migrasi.

Status payment, fulfillment, dan refund terpisah. Harga rupiah integer, waktu UTC.
Operasi multi-langkah atomik wajib menggunakan SQL function/RPC, bukan beberapa
request supabase-js terpisah. Callback harus diverifikasi dan diproses idempoten.
