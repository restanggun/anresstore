# Tahapan implementasi

1. Fondasi repository, aplikasi, tooling, dokumentasi bisnis (scaffold tersedia).
2. Instalasi dependency, lockfile, build terverifikasi dan Supabase lokal (tertunda akses lingkungan).
3. Katalog, Supabase Auth, role dan uji akses RLS.
4. Checkout, gateway sandbox, RPC atomik, webhook inbox/outbox dan idempotensi.
5. Dashboard operasional, audit, refund, rekonsiliasi dan bantuan.
6. Staging, uji failure/duplikasi, backup/restore dan monitoring.
7. Migrasi bertahap; satu sistem menjadi pemroses transaksi pada satu waktu.

Worker/Redis/BullMQ dibuat ketika ada pekerjaan asinkron. Bot WhatsApp ditunda.
