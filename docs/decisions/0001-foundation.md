# 0001 — Fondasi monorepo

Gunakan npm workspaces karena npm tersedia di Windows ini dan struktur cukup
sederhana. Node minimum 22.18; CI/Docker memakai Node 24. Tidak menambah Turborepo
atau antrean sebelum diperlukan. Next.js 16, React 19, Tailwind 4, NestJS 11,
TypeScript 5.9, Supabase JS 2 menjadi rentang awal; exact dependency tree belum
terkunci karena registry menolak akses pada sesi setup.

Komponen Button bersama mengikuti pola shadcn: Radix Slot, CVA, clsx dan
tailwind-merge. Styling memakai utility warna langsung; token brand final menyusul.

Target pekerjaan ini setup lokal sesuai rancangan `D:\anres-store` dan arah VPS.
Tidak mendaftarkan hosting Sites atau GitHub pada tahap ini. Lisensi, pemilik
CODEOWNERS, brand final, integrasi, dan cloud tetap menunggu keputusan pemilik.
