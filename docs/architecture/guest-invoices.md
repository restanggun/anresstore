# Invoice guest dan akun

Invoice guest tersimpan melalui cookie HttpOnly browser selama 30 hari. Nomor invoice saja tidak memberi akses. Saat login, invoice otomatis ditautkan apabila cookie asal tersedia dan email akun yang terverifikasi sama dengan email checkout. Invoice tanpa email checkout tidak bisa diklaim lewat email.

Invoice yang sudah ditautkan tersedia dari akun pada perangkat lain. Cookie guest lama tidak lagi cukup untuk membukanya. Nomor invoice, snapshot pesanan, nominal, dan status pembayaran tetap; kepemilikan akun dicatat terpisah dengan audit.

Pemulihan lintas perangkat memakai nomor invoice dan kode email Supabase Auth. Pengguna harus masuk dengan email checkout yang terverifikasi. Kode dikirim hanya ke email akun, bukan alamat dari formulir. Respons awal tidak mengungkap keberadaan invoice. Challenge berlaku 10 menit, maksimal lima percobaan, satu kali pemakaian, dan terikat akun. Permintaan dibatasi per IP dan akun.

Riwayat akun dan invoice guest browser ditampilkan terpisah. Pengguna dapat menyimpan tiap invoice sebagai PDF melalui dialog cetak browser. Ekspor CSV memerlukan login, hanya mencakup invoice milik akun pada mode pembayaran aktif, maksimal 5.000 invoice; input yang berpotensi menjadi formula spreadsheet dinetralkan.

Migrasi: `20261119000000_invoice_account_claims.sql`. Pengujian database: `supabase/tests/invoice-account-claims.sql`; pengujian aplikasi: `apps/api/test/invoice-account.test.mjs`.
