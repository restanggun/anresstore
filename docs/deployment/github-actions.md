# Deploy otomatis dari GitHub Actions

Workflow `.github/workflows/ci.yml` menjalankan pemeriksaan pada push dan pull request. Push ke `main` akan deploy ke VPS hanya setelah semua pemeriksaan lulus dan variable repository `VPS_DEPLOY_ENABLED` bernilai `true`.

## Aktifkan deploy

1. Tambahkan repository secret `VPS_SSH_KEY` yang berisi private key khusus GitHub Actions. Jangan memakai private key SSH pribadi.
2. Tambahkan repository variable `VPS_DEPLOY_ENABLED` dengan nilai `true`.
3. Pastikan public key pasangannya tersedia di `/root/.ssh/authorized_keys` VPS dengan pembatasan forced command yang tercantum di langkah setup pada sesi deployment.

Gunakan opsi SSH **restrict** dan **command** untuk membatasi key CI. Deploy hanya dapat menjalankan `/opt/anresstore/scripts/deploy-production.sh`. Public key host VPS dipatok di workflow agar koneksi SSH memeriksa identitas server.

Workflow membangun dan mengganti container web, admin, dan API, menunggu health check container, lalu memeriksa URL production. Run CI mengirim SHA yang sudah lolos pengecekan. VPS menolak SHA yang bukan lagi tip `main` dan mengunci deploy agar deploy manual dan GitHub tidak berjalan bersamaan. Database migrations dijalankan terpisah.

Setelah mengaktifkan `VPS_DEPLOY_ENABLED`, push ke `main` atau pilih **Run workflow** pada branch `main`. Perubahan variable saja tidak memicu run.
