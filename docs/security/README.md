# Kontrol keamanan

- Simpan secret hanya pada environment server. NEXT_PUBLIC_* bersifat publik.
- RLS wajib untuk seluruh tabel yang dapat diakses client. Uji lintas pengguna.
- Backend service role melewati RLS sehingga wajib memeriksa role dan ownership.
- Role admin tidak boleh bersumber dari metadata yang dapat diubah pengguna.
- Verifikasi signature webhook, referensi, nominal dan idempotensi di server.
- CORS memakai origin eksplisit; CORS bukan mekanisme autentikasi.
- Dashboard memuat data dan tindakan sensitif; akses API harus memverifikasi sesi,
  UUID/role admin, scope layanan, MFA dan origin untuk perubahan data.
- Produksi memerlukan TLS, rate limiting, kebijakan retensi, monitoring dan review.
