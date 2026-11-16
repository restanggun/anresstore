# Membekukan release

Release adalah commit lengkap dan bersih, bukan salinan workspace yang terus berubah. Cache, screenshot, catatan browser, arsip lokal, dependency hasil instalasi, dan secret tidak boleh ikut dalam commit atau image produksi. Artefak lama yang diarsipkan di `recycle-bin/` hanya untuk pemulihan workspace dan selalu dikecualikan dari Git serta Docker.

1. Tinjau `git status --short`, `git diff --stat` dan diff source/migrasi. Sertakan aset baru yang dipakai aplikasi. Jangan stage secret, dump pelanggan, cache atau berkas sementara. Perubahan timestamp migrasi harus tetap direkonsiliasi dengan hosted sebelum deploy.
2. Jalankan `npm run typecheck`, `npm test`, `npm run test:web`, `npm run test:db` dan `node --test scripts/monitor-operations.test.mjs`. Build image Linux dan E2E tetap gerbang terpisah sesuai runbook VPS.
3. Commit kandidat secara lengkap, lalu `node scripts/check-release.mjs`. Exit nonzero memblokir release. Catat SHA dan hasil setiap pemeriksaan di catatan release privat. Jangan mengubah source setelah SHA dibekukan.
4. Buat checkout bersih SHA tersebut di VPS/build host. Build ketiga image, tag `anres-web:SHA`, `anres-admin:SHA`, `anres-api:SHA` dan catat image ID/digest aktual. Simpan dengan `docker image save` atau registry privat; jangan hanya menyimpan nama tag. Simpan Compose/Caddyfile dari SHA yang sama, override `image:` untuk ketiga service, backup secret terenkripsi dan backup database teruji restore.
5. Pastikan image/config release sebelumnya masih tersedia. Uji rollback memakai override image dan `--no-build`, jangan membalik migrasi otomatis atau menghapus volume Caddy. Catat operator, waktu, SHA, image digest, status backup/restore, E2E, penerima alert dan keputusan staging/live.

Kandidat commit lokal bukan persetujuan go-live. Jika pemeriksaan gagal atau konfigurasi berubah, buat kandidat baru dan ulangi pemeriksaan yang terdampak. Jangan menulis secret di catatan release repository.
