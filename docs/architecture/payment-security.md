# Pengamanan pembayaran produksi

Pembayaran memakai endpoint Tripay produksi. API memvalidasi konfigurasi saat startup, termasuk origin HTTPS, callback, return URL, kredensial dan polling rekonsiliasi.

Harga browser tidak dipercaya: server memvalidasi produk, harga, tujuan, jumlah paket dan ketersediaan sebelum reservasi. Reservasi dan klaim pengiriman bersifat atomik. Callback diverifikasi dengan signature dan dicocokkan dengan invoice. Perubahan status tidak boleh melewati aturan transisi database.

Invoice akun hanya dapat dibaca pemilik sesi. Invoice guest terikat cookie HttpOnly. Akses database pembayaran dibatasi ke service role; secret tidak dikirim ke browser. Admin menggunakan role dan MFA, serta tidak dapat menandai pembayaran lunas melalui dashboard.

Worker tidak mengirim ulang pesanan dengan hasil ambigu. Rekonsiliasi provider, peninjauan manual, pemantauan antrean dan backup tetap bagian operasi produksi.

Jalankan npm run test:db, npm run test --workspace=@anres/api, npm run test:web, dan npm run typecheck. Pengujian otomatis memeriksa aturan sistem tanpa menagih gateway atau membeli produk. Verifikasi transaksi nyata pada VPS harus dicatat terpisah; keberhasilan tes lokal tidak menyatakan deploy telah selesai.
