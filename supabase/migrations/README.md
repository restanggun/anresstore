# Migrasi

Belum ada skema domain. Buat migrasi melalui `npx supabase migration new <nama>`.
Semua tabel yang bisa diakses Data API wajib memakai RLS dan grant eksplisit.
Skema transaksi, RPC atomik, dan idempotensi dibuat pada tahap checkout.
