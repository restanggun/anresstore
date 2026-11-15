# Tiket dan room chat CS

Customer membuat tiket melalui tombol **+ Tiket / Room chat** pada Bantuan, akun, atau profil. Form dan percakapan tampil sebagai popup. Admin memakai menu Room chat CS atau Bantuan pelanggan; keduanya mengakses tiket yang sama. Website dan admin memakai komponen room chat bersama dari `@anres/ui`. Detail notifikasi chat dan konfigurasi SMTP Sender.com ada di [notifikasi CS](../operations/support-notifications.md).

Status `new` berarti menunggu CS. Customer dapat menambahkan pesan sambil menunggu. Admin menerima tiket (`in_progress`) sebelum membalas, menolak (`rejected`) dengan alasan, atau menyelesaikan (`closed`). Tiket ditolak/selesai tidak menerima pesan. Admin dapat menerima kembali tiket jika diperlukan. Pesan dan status diperbarui melalui polling lima detik; daftar admin diperbarui setiap 15 detik.

AI menyediakan tombol pengalihan dan mendeteksi permintaan bicara dengan CS/manusia, membuat tiket, atau keluhan AI tidak membantu. Pengalihan membuat satu tiket akun dengan seluruh riwayat sesi dan membuka popup chat CS. Login diperlukan. Permintaan pengalihan eksplisit disimpan tanpa bergantung pada ketersediaan provider AI. Sesi dan konversinya memerlukan migrasi `20261118080000_ai_help_sessions.sql`.

API customer menyaring setiap akses berdasarkan identitas sesi. API admin memerlukan `support.read`/`support.write` dan akses seluruh layanan. Tabel serta RPC hanya dapat diakses oleh service role. RPC pembuatan menyimpan tiket dan konteks awal dalam satu transaksi; pengiriman pesan mengunci tiket untuk mencegah balapan dengan penutupan. ID permintaan dipertahankan saat retry di UI untuk menghindari duplikasi.

Migrasi `20261118070000_support_ticket_workflow.sql` harus diterapkan pada database tujuan bersama migrasi sebelumnya sebelum menjalankan versi API ini. Tidak ada migrasi remote yang diterapkan otomatis oleh perubahan kode.

Validasi: `npm run typecheck`, `npm run test:db`, dan `npm run test --workspace=@anres/api`. Pemeriksaan browser dengan data tiruan berada di `output/playwright/support-unified-review.js`.
