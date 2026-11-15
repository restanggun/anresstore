# Sesi bantuan AI dan konversi CS

Chat Bantuan menyimpan riwayat di `ai_help_sessions` melalui API `/v1/help/ai-sessions`. Riwayat berasal dari database, bukan daftar pesan yang dikirim browser. Akun memakai identitas yang diverifikasi server; tamu memakai hash cookie HttpOnly acak dari layanan identitas yang sama dengan checkout. Tabel dan fungsi hanya tersedia untuk service role.

- `GET /?page=0`: daftar sesi milik pengguna, 20 sesi per halaman.
- `POST / {id}`: membuat sesi dengan ID UUID dari browser; pengulangan ID yang sama aman.
- `GET /:id`: membuka seluruh arsip pesan satu sesi.
- `POST /:id/messages {id,content}`: menjawab pertanyaan menggunakan riwayat sesi, lalu menyimpan satu pasangan pertanyaan/jawaban secara atomik. ID pesan mencegah duplikasi ketika permintaan dicoba ulang. Versi riwayat diperiksa dalam transaksi agar dua tab tidak menimpa pesan.
- `POST /:id/convert`: perlu login. Membuat satu tiket CS dan menyalin seluruh riwayat, kemudian menandai sesi telah dialihkan. ID tiket sama dengan ID sesi. Konversi ulang mengembalikan tiket yang sama. AI berhenti membalas sesi yang telah dialihkan.

Arsip dibatasi 200 pesan (100 pasangan). Konteks model memakai paling banyak 29 pasangan terbaru dan pertanyaan saat ini, dengan batas 48.000 karakter. Arsip tetap utuh walaupun pesan lama berada di luar konteks model. Sesi baru memiliki konteks terpisah. Jika sesi penuh, pengguna memulai sesi baru atau mengalihkannya ke CS.

Tamu dapat membuka kembali riwayat selama cookie browser masih tersedia. Setelah login, sesi tamu dari browser tersebut dapat dikonversi. Saat dikonversi, kepemilikannya dipindahkan ke akun sehingga akses tamu berakhir. Sesi yang dibuat saat login tersedia dari perangkat lain melalui akun yang sama.

Konversi memakai satu transaksi database. Pesan AI diberi peran `ai`, ditampilkan sebagai Anres AI di panel pengguna dan admin. Pesan lebih dari 3.000 karakter dipecah menjadi bagian berurutan tanpa menghilangkan teks. Tiket masuk dengan status `new`; CS tetap harus menerima tiket sesuai alur yang sudah ada.

Migrasi: `supabase/migrations/20261118080000_ai_help_sessions.sql`. Uji controller: `node --test apps/api/test/help.test.mjs apps/api/test/ai-sessions.test.mjs` sesudah build API. Uji transaksi dan RLS: `npm run test:db`.
