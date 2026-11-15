# Tiket, chat, dan email CS

Website dan dashboard memakai `SupportChatDialog` dari `@anres/ui`, sehingga ukuran popup, spacing, bubble pesan, input, dan perilaku scroll sama. Aksi pengelolaan tiket tersedia untuk admin. Pesan baru otomatis menggulir percakapan ke bawah dan menampilkan informasi chat baru.

Sidebar dan lonceng dashboard memeriksa tiket/chat baru setiap lima detik. Hitungan tiket menunggu dihitung di database, bukan dari satu halaman daftar. Membuka halaman pesan terbaru menandai pesan sudah dibaca; membaca halaman riwayat lama tidak menghapus notifikasi baru. Website juga menampilkan penanda chat dari CS pada daftar tiket.

## SMTP Sender.com

Isi konfigurasi server API, menggunakan nilai SMTP dari akun Sender.com:

```dotenv
SUPPORT_EMAIL_ENABLED=true
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Anres Store <support@domain-anda.com>
SUPPORT_CS_EMAILS=cs@domain-anda.com
```

`SMTP_SECURE=false` memakai STARTTLS wajib; untuk SMTP TLS langsung gunakan port 465 dan `SMTP_SECURE=true`. Sertifikat TLS tetap diverifikasi. `SUPPORT_CS_EMAILS` menerima maksimal sepuluh alamat dipisahkan koma. Jangan menaruh kredensial pada frontend atau variabel `NEXT_PUBLIC_*`.

Pastikan `AUTH_ADMIN_ORIGIN` dan `AUTH_APP_ORIGIN`/`AUTH_WEB_ORIGIN` mengarah ke dashboard dan website yang benar. Restart API setelah konfigurasi diisi. Secara default `SUPPORT_EMAIL_ENABLED=false`, sehingga tidak ada email nyata yang dikirim sebelum konfigurasi diaktifkan.

Email CS dibuat ketika tiket baru masuk. Email customer dibuat ketika tiket pertama kali diterima (`in_progress`), selesai (`closed`), atau ditolak (`rejected`). Pesan chat biasa tidak membuat email. Alamat customer diambil dari akun Supabase yang terverifikasi; alamat penerima tidak diambil dari input customer.

Event disimpan secara transaksional dalam `support_email_outbox`. Worker berjalan setiap 30 detik, memakai lease untuk mencegah dua worker mengerjakan event yang sama, mencoba ulang dengan jeda bertambah hingga lima percobaan, dan menyimpan status `sent`/`failed`. Satu kombinasi tiket dan status hanya membuat satu event. SMTP tidak menjamin deduplikasi penerimaan bila koneksi putus setelah server menerima email; Message-ID tetap sama saat dicoba ulang. Kegagalan SMTP tidak menghambat pembuatan tiket atau pengiriman chat.

Migrasi terkait: `20261118110000_support_notifications.sql` dan `20261118120000_support_delivery.sql`. Audit log tetap hanya bisa ditambah dan dibaca oleh service role; API memakai INSERT biasa untuk audit, bukan upsert.
