# Deploy VPS

Target saat ini: satu VPS Linux, Docker Engine + Compose v2, Caddy, tiga aplikasi, dan Supabase hosted terpisah. Ini runbook untuk konfigurasi yang ada, bukan bukti deploy telah dilakukan. Jalankan perintah dari root repository.

## Sebelum staging

- Siapkan commit release lengkap, termasuk file untracked yang memang diperlukan. Jangan deploy dari workspace yang berubah. Simpan commit dan image release sebelumnya untuk rollback.
- Arahkan DNS `anresstore.site`, `auth`, `app`, `admin`, dan `api` ke VPS. Hapus record AAAA bila IPv6 belum berfungsi. Izinkan TCP 80/443, UDP 443 opsional, dan SSH hanya dari sumber pengelola. Jangan publikasikan port 3000/3001/4000.
- Periksa subnet `172.30.50.0/24` tidak berbenturan dengan jaringan VPS. Jika diubah, sesuaikan IP edge dan `TRUST_PROXY_CIDRS` bersamaan.
- Backup database dan buktikan restore pada lingkungan terpisah. Rekonsiliasi history migrasi hosted dengan schema aktual; replay disposable yang lulus tidak membuktikan history remote sudah selaras. Jangan menjalankan db reset pada hosted atau replay migrasi awal tanpa pemeriksaan.
- Verifikasi hosted Supabase Auth: Site URL, redirect allowlist untuk alur di `auth`/`app`/`admin`, Google OAuth bila digunakan, SMTP, email konfirmasi/reset, MFA admin dan allowlist UUID. File `supabase/config.toml` lokal tidak otomatis menerapkan pengaturan hosted.
- Gunakan database dan kredensial sandbox untuk staging. Jangan mengaktifkan pembelian supplier nyata selama pengujian sandbox.

## Konfigurasi dan build

```sh
cp infra/api.env.example apps/api/.env.production
chmod 600 apps/api/.env.production
# Isi kredensial di server, jangan tempelkan isinya pada log/tiket.
npm ci
node scripts/check-production-env.mjs
docker compose -f infra/compose.production.yaml config --quiet
docker compose -f infra/compose.production.yaml build --pull
docker compose -f infra/compose.production.yaml up -d --wait --wait-timeout 180
docker compose -f infra/compose.production.yaml ps
```

Node 24 diperlukan untuk preflight lokal. Alternatif tanpa Node host setelah image dibangun:

```sh
docker compose -f infra/compose.production.yaml run --rm --no-deps -v "$PWD/apps/api/.env.production:/run/anres.env:ro" api node scripts/check-production-env.mjs /run/anres.env
```

`config --quiet` memvalidasi Compose tanpa mencetak hasil interpolasi secret. URL `NEXT_PUBLIC_*` ditanam saat build; perubahan domain memerlukan rebuild web/admin, perubahan Caddyfile dan checker environment. Secret API memakai env_file runtime dan dikecualikan dari build context. Runtime memakai non-root; devDependencies dipangkas, tetapi source workspace masih ada dalam image. Ukuran dan startup image tetap perlu diuji di Linux.

Healthcheck web mengirim Host domain yang dikenali proxy aplikasi. Healthcheck API hanya memeriksa proses HTTP, bukan kesiapan database/provider. Compose `--wait` menunggu status running/healthy, bukan validasi bisnis. Container yang kemudian unhealthy memerlukan alert dan penanganan; restart policy bukan pemulihan otomatis dari semua kondisi unhealthy. Referensi: [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) dan [startup order](https://docs.docker.com/compose/how-tos/startup-order).

## Smoke test wajib

- Buka kelima domain; periksa TLS, redirect subdomain, login/logout, konfirmasi email, reset password, refresh sesi dan akses admin dengan MFA. Pastikan origin asing dan pengguna tanpa role ditolak.
- Periksa `/v1/health`, katalog supplier serta perubahan katalog admin yang tersimpan. Pastikan secret tidak muncul di bundle browser.
- Buat checkout sandbox dari keranjang dan detail produk; cocokkan harga server, invoice, callback, riwayat dan status order. Uji callback duplikat, timeout/recovery, sesi guest dan larangan akses invoice pelanggan lain.
- Sandbox harus tetap terisolasi dari order VIPayment nyata. Uji layanan manual dan supplier otomatis secara terpisah. Unit test tidak menggantikan E2E provider.
- Periksa `docker compose -f infra/compose.production.yaml logs --tail=100` secara privat. Uji restart/reboot VPS, pemulihan aplikasi dan persistensi sertifikat Caddy. Tambahkan monitoring disk/RAM, uptime, error API, pembayaran pending/unknown, fulfillment dispatching/unknown/manual_review, serta kegagalan rekonsiliasi.

## Go-live dan rollback

Go-live hanya setelah smoke test dan E2E provider disetujui. Rekonsiliasi invoice sandbox yang belum selesai sebelum mengganti mode; callback mode lama ditolak saat API memakai mode baru. Ganti kredensial merchant, `TRIPAY_MODE=live`, base URL live, serta aktifkan fulfillment VIPayment setelah saldo, SKU, nominal/fee dan klaim order atomik diuji. Jalankan checker dengan `--allow-live`; opsi tersebut hanya membuka validasi konfigurasi, bukan persetujuan operasional. Restart dengan `up -d --force-recreate --wait`, lalu verifikasi transaksi terbatas dan satu fulfillment per pembayaran.

Sebelum update, tag ketiga image aplikasi dengan identitas release dan simpan Compose/Caddyfile yang sesuai beserta backup konfigurasi secret di penyimpanan aman. Jangan hanya mengandalkan tag image otomatis Compose yang dapat tertimpa build berikutnya. Rollback memakai image/config release sebelumnya melalui override Compose `image:` untuk web/admin/api dan `up -d --no-build --wait`. Jangan otomatis membalik migrasi database: pastikan kompatibilitas schema atau lakukan pemulihan terencana. Jangan gunakan `down -v` karena menghapus volume sertifikat Caddy. Jika hasil pembelian supplier unknown, rekonsiliasi referensi/status terlebih dahulu; jangan mengirim ulang pembelian secara buta.
