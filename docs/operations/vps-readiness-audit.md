# Audit lanjutan kesiapan VPS — 14 November 2026

Status: persiapan staging diperkuat; belum ada bukti deploy Linux atau persetujuan transaksi uang nyata. Pemeriksaan ini dilakukan pada workspace lokal yang memiliki banyak perubahan modified/untracked. Tidak melakukan deploy, perubahan data pelanggan, migrasi hosted, atau penggantian mode pembayaran.

## Bukti terbaru

- Typecheck seluruh workspace: lulus.
- Test API: 99/99 lulus. Test web: 10/10 lulus.
- Replay 23 migrasi pada PostgreSQL disposable melalui PGlite: lulus, termasuk uji mode pembayaran, reservation, immutable metadata, RLS dan fulfillment. Tidak ada versi migrasi duplikat pada set yang diuji. Ini tidak membuktikan sinkronisasi history hosted atau seluruh perilaku Supabase terkelola.
- Build produksi admin/API/web: lulus memakai lima URL domain produksi dan `ANRES_NEXT_DIST_DIR=.next-vps-audit`. Lingkungan Windows, Node 26.13.0; web membaca `.env.local` yang sudah ada. Build dengan context Docker bersih dan Node 24 belum dibuktikan.
- `npm audit --omit=dev`: 0 kerentanan terlapor saat pemeriksaan. Bukan jaminan seluruh kode aman.
- Checker environment: syntax valid; lima kasus sintetis lulus (sandbox valid, MFA nonaktif ditolak, live tanpa opsi ditolak, live dengan opsi diterima, return origin asing ditolak). Template dengan secret kosong ditolak tanpa mencetak nilainya.
- `git diff --check`: tidak menemukan kesalahan whitespace; ada peringatan normalisasi CRLF dari Git.

## Koreksi audit sebelumnya

Laporan lama di `output/production-readiness-audit.md` adalah snapshot sebelum perubahan terbaru. Tripay kini mendukung endpoint sandbox/live yang dipasangkan dengan mode eksplisit; controller menyimpan mode invoice dan menolak callback lintas mode. Jalur client-priced order lama dinonaktifkan; `orders.ts` tidak lagi menulis order simulasi. Uji migrasi dan RLS sudah tersedia dan lulus. CI sudah memasok URL produksi. Temuan lama mengenai sandbox-only, jalur checkout localStorage aktif, duplikat versi migrasi dan environment build CI kosong tidak berlaku pada snapshot saat ini.

Hal tersebut tidak membuktikan E2E provider: penerimaan callback publik, fee merchant, pembayaran nyata, pemulihan timeout, dan satu pembelian supplier untuk satu invoice tetap perlu diuji di staging/live terbatas.

## Perubahan persiapan deploy

- Compose produksi: healthcheck web/admin/API, init process, grace period 30 detik dan log rotation 10 MB × 3 per service. Healthcheck storefront memakai Host domain sah sehingga tidak ditolak routing host.
- Dockerfile: install wajib `npm ci`, pangkas devDependencies setelah build, matikan telemetry runtime. Runtime tetap non-root. Image masih menyalin source workspace; belum menggunakan standalone output.
- Build context mengecualikan output audit, profil automation, backup, log, key/pem, dan cache build. Environment secret tetap dikecualikan.
- CI menjalankan test web tambahan dan instalasi berdasarkan lockfile.
- Template API produksi tanpa secret, checker offline dan runbook deploy/rollback tersedia. Healthcheck hanya mendeteksi kesehatan proses HTTP; tidak membuktikan database/provider siap.

## Penghalang yang masih terbuka

Pembaruan poin 5/6: checker release, pengecualian cache, monitor transaksi read-only
dan timer systemd tersedia. Lihat [release checklist](release-checklist.md) dan
[SOP transaksi](transaction-operations.md). Pembekuan SHA final masih memerlukan
workspace stabil; aktivasi monitor/penerima alert dan drill VPS belum dibuktikan.

1. Docker tidak tersedia di PATH mesin audit: `compose config`, build ketiga image Linux/Node 24, startup setelah pruning dependency, healthcheck container dan restart VPS belum diuji. Jangan menandai image siap sebelum langkah ini lulus.
2. Secret `.env.production` belum disiapkan oleh audit. Checker tidak memvalidasi kredensial secara online. Hosted Auth/SMTP/MFA, origin callback dan provider egress whitelist harus diverifikasi.
3. Schema/history migrasi hosted tidak diaudit ulang pada sesi ini. Backup, rekonsiliasi drift dan restore test harus selesai sebelum menerapkan migrasi.
4. DNS/TLS/firewall, cross-subdomain cookie/CORS, guest ownership, callback duplikat/timeout/recovery dan fulfillment provider belum dibuktikan melalui VPS publik.
5. Release belum dibekukan: file modified/untracked harus ditinjau dan masuk commit yang lengkap. Simpan image/config release untuk rollback; jangan membalik migrasi otomatis.
6. Monitoring pending/unknown/manual_review, rekonsiliasi harian, SOP refund, dan penanganan supplier timeout harus aktif sebelum uang nyata diterima.

Langkah operasional: [runbook VPS](vps-deployment.md). Urutan terdekat adalah konfigurasi secret staging → validasi Compose dan image Linux → deploy sandbox pada domain → smoke test E2E → review go-live.
