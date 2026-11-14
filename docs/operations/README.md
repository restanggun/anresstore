# Operasional

Persiapan release: [checklist pembekuan release](release-checklist.md).
Monitoring, rekonsiliasi, timeout supplier dan refund:
[SOP transaksi](transaction-operations.md).

Panduan staging, konfigurasi secret, smoke test, go-live dan rollback ada di
[deploy VPS](vps-deployment.md). Template environment server ada di
[`infra/api.env.example`](../../infra/api.env.example); validasi offline melalui
`node scripts/check-production-env.mjs` setelah file produksi diisi.

Hasil verifikasi lokal dan penghalang yang masih terbuka dicatat dalam
[audit kesiapan VPS](vps-readiness-audit.md).

Sebelum staging: tetapkan SOP bantuan dan verifikasi pemilik order, eskalasi,
refund, rekonsiliasi harian, alert transaksi tertunda, backup dan uji restore.
Saat hasil pembelian pemasok timeout/tidak diketahui, cek status sebelum retry.
Retry notifikasi harus terpisah dari retry pembelian. Catat status history dan audit.
Belum ada proses produksi yang dijalankan dari repository ini.
