# Alur layanan dan bantuan pelanggan

Gunakan acuan ini untuk menjelaskan proses pembelian, penanganan pesanan, dan tindak lanjut pelanggan. Harga, pilihan paket, dan ketentuan mengikuti data produk dan invoice terkait.

## Perjalanan pelanggan

1. **Pilih produk.** Pelanggan bisa menelusuri Katalog tanpa login. Halaman produk memuat pilihan paket atau nominal dan data yang harus diisi.
2. **Periksa checkout.** Pelanggan memeriksa produk, tujuan atau instruksi, kontak, total, serta metode pembayaran yang ditampilkan.
3. **Pantau invoice.** Gunakan invoice yang sama untuk memeriksa status pembayaran dan status pemenuhan. Jika status pembayaran belum jelas, cek invoice sebelum membayar kembali.
4. **Minta bantuan.** Pelanggan dapat membuka jawaban cepat atau asisten AI. Untuk membicarakan pesanan dengan tim, pelanggan masuk dan membuka Tiket dan chat CS.

## Pemenuhan per kategori

| Kategori | Pemenuhan dan tindak lanjut |
| --- | --- |
| Top up game, PPOB, dan booster media sosial | Pesanan diproses sesuai paket setelah pembayaran terverifikasi. Varian dapat diproses lewat penyedia atau antrean admin. Periksa status pengiriman pada invoice. |
| Joki tugas | Tim menangani pekerjaan setelah pembayaran terverifikasi. Pelanggan dapat melihat hasil dan meminta revisi sesuai opsi yang tercatat pada pesanan. |
| Aplikasi premium | Ikuti petunjuk pembayaran dan verifikasi pada invoice. Pengiriman akses mengikuti paket dan kanal pesanan. Periksa masa aktif dan ketentuan garansi pada paket terkait. |

[Alur produksi per kategori](../operations/category-production-readiness.md)

## Panduan penanganan tiket

- Gunakan nomor invoice sebagai referensi saat memeriksa pesanan. Jika invoice tamu tidak terlihat, bantu pelanggan mengikuti pemulihan invoice dengan email checkout bila memenuhi syarat. [Invoice tamu dan akun](../architecture/guest-invoices.md)
- Periksa status pembayaran dan pemenuhan secara terpisah sebelum menjawab. Untuk kendala pengiriman, cek hasil penyedia atau catatan pengerjaan admin sesuai kategori. [Operasional transaksi](../operations/transaction-operations.md)
- Catat langkah berikutnya di tiket agar pelanggan dapat memantau status dan membaca balasan. Untuk refund atau klaim garansi, periksa kelayakan berdasarkan pesanan. [Alur tiket CS](../architecture/support-tickets.md) [Permintaan refund](../operations/refund-requests.md)
- Gunakan kanal yang ditentukan untuk penanganan pesanan. Jaga kerahasiaan kata sandi, kode OTP pribadi pelanggan, dan data sensitif. Asisten AI menjawab pertanyaan umum dan dapat mengalihkan percakapan, sementara pemeriksaan akun atau pesanan dilakukan oleh tim CS melalui tiket.
