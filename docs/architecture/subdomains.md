# Arsitektur subdomain Anres Store

| Area | Lokal (`npm run dev:subdomains`) | Produksi | Service |
| --- | --- | --- | --- |
| Publik | `http://anres.localhost:3000` | `https://anresstore.site` | web |
| Autentikasi | `http://auth.anres.localhost:3000` | `https://auth.anresstore.site` | web |
| Pelanggan | `http://app.anres.localhost:3000` | `https://app.anresstore.site` | web |
| API | `http://api.anres.localhost:4000/v1` | `https://api.anresstore.site/v1` | api |
| Admin | `http://admin.anres.localhost:3001` | `https://admin.anresstore.site` | admin |

Domain admin menggunakan `.site`, bukan `.sie`.

## Batas aplikasi

`apps/web` melayani tiga hostname dengan Next.js Proxy. Ini pemisahan origin dan routing, bukan lima deployment frontend terpisah. Komponen UI tetap digunakan bersama. `apps/admin` dan `apps/api` merupakan service terpisah.

- Domain publik: landing, tentang, bantuan. Landing tidak bergantung pada sesi API untuk tampil.
- Auth: `/login`, `/daftar`, `/lupa-password`, `/auth/*`. Root auth diarahkan ke login.
- App: root dashboard pelanggan, `/profil`, `/katalog/*`, `/keranjang`, `/invoice/*`, `/pesanan/*`, `/pembayaran/*`. Katalog dan checkout tamu tetap dapat diakses tanpa login. Akses data akun tetap diverifikasi API.
- URL lama pada domain yang salah diarahkan ke origin kanonis dengan path dan query tetap dipertahankan. Host tidak dikenal ditolak saat mode subdomain aktif.
- Login admin menggunakan auth terpusat saat `NEXT_PUBLIC_AUTH_URL` tersedia. MFA dan otorisasi admin tetap dilaksanakan oleh admin/API. Parameter `app=admin` memilih tujuan tetap dari konfigurasi, bukan URL redirect bebas.

## Menjalankan lokal

1. Gunakan Node sesuai `package.json`, jalankan `npm ci`, siapkan `.env` API berdasarkan `.env.example`, dan aplikasikan migrasi Supabase yang dibutuhkan fitur aktif.
2. Hentikan server lama yang memakai port 3000, 3001, dan 4000, lalu jalankan `npm run dev:subdomains`.
3. Buka alamat pada tabel. Runner memasok URL frontend, callback, CORS, dan origin admin melalui environment tanpa menulis ulang secret lokal.
4. Browser modern memperlakukan `.localhost` sebagai loopback. Bila OS/tool lokal tidak mengenalinya, tambahkan kelima hostname lokal ke hosts dengan alamat `127.0.0.1`.

`npm run dev` tetap tersedia untuk workflow localhost lama; kosongkan variabel subdomain bila memakai mode tersebut. Jangan mencampur localhost lama dengan subdomain: cookie host-only dan localStorage berasal dari origin berbeda. Keranjang tamu lama di localhost tidak otomatis berpindah. Keranjang akun berada di server.

## Session dan Google

Browser mengirim `credentials: include` ke API. Cookie sesi tetap host-only di API, `HttpOnly`, `SameSite=Lax`, dan `Secure` pada produksi. Tidak ada cookie `Domain=.anresstore.site`. CORS memakai allowlist eksplisit; API memeriksa Origin untuk perubahan data. Semua subdomain produksi harus memakai HTTPS pada domain induk yang sama.

OAuth Google menggunakan PKCE dan callback `https://api.anresstore.site/v1/auth/callback`. Login berhasil menuju app atau admin; kegagalan pelanggan menuju auth. Setiap permintaan Google menyertakan `prompt=select_account`, sehingga pengguna memilih akun kembali. Logout menghapus cookie akses, refresh, recovery, verifier PKCE, dan jenis login; state UI hilang melalui navigasi penuh dan data form auth sementara dibersihkan. Ini tidak menghapus cookie Google maupun membuat pengguna logout dari layanan Google.

Di Supabase, masukkan callback API lokal dan produksi ke Redirect URLs, serta atur Site URL ke origin auth produksi. Google OAuth authorized redirect URI tetap endpoint callback milik project Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`), bukan endpoint frontend Anres. Jangan menaruh client secret atau service-role key di variabel `NEXT_PUBLIC_*`.

## Deployment VPS

1. Arahkan DNS A/AAAA untuk domain utama, auth, app, api, dan admin ke VPS. Jangan memasang AAAA bila server tidak melayani IPv6. Buka port 80/443 untuk Caddy.
2. Buat `apps/api/.env.production` di server dari `.env.example`. Isi secret Supabase/provider dan konfigurasi admin yang benar. File ini diabaikan Git dan Docker build context. Compose menetapkan origin produksi secara eksplisit.
3. Jalankan `docker compose -f infra/compose.production.yaml config --quiet`, lalu `docker compose -f infra/compose.production.yaml up -d --build` dari root repo.
4. Caddy memperoleh sertifikat dan menyimpannya pada volume persisten. Hanya port edge dipublikasikan; web, admin, dan API berada di jaringan Docker. API mempercayai hanya IP Caddy `172.30.50.2/32`. Jika subnet bentrok, ubah subnet, IP edge, dan trust proxy bersamaan.
5. Verifikasi health API `/v1/health`, login/logout email dan Google, callback gagal, penolakan CORS asing, checkout tamu, serta login admin/MFA. Pantau log tanpa merekam token atau secret.

Nilai `NEXT_PUBLIC_*` dimasukkan pada **build time** dan runtime lewat Compose. Perubahan domain memerlukan rebuild kedua frontend. Production build menolak URL frontend yang kosong/tidak valid. API produksi menolak origin non-HTTPS atau yang belum masuk allowlist.

## Batas kesiapan

Konfigurasi ini menyiapkan routing dan deployment; DNS, sertifikat publik, OAuth provider, secret, migrasi database, backup, dan uji akun nyata harus diverifikasi di lingkungan tujuan. Tidak ada deployment publik otomatis dari pekerjaan lokal ini. Integrasi pembayaran tetap mengikuti batas sandbox yang sudah ada; perubahan domain tidak mengaktifkan transaksi live.

Pemeriksaan: `npm run test:domains`, `npm run typecheck`, `npm test`, serta production build dengan kelima variabel URL terisi. Gunakan `ANRES_NEXT_DIST_DIR=.next-subdomains` untuk build/preview terisolasi dari server development yang aktif.
