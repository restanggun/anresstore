# Pengajuan pengembalian dana

Dokumentasi resmi https://tripay.co.id/developer mencantumkan status REFUND dan verifikasi callback, tetapi tidak mendokumentasikan endpoint publik untuk memulai refund (diperiksa 15 November 2026). Karena itu semua pengembalian ditangani manual melalui tiket CS; tidak ada transfer otomatis atau perubahan palsu status Tripay.

Pengguna yang masuk mengajukan dari invoice live yang lunas dan mengalami kendala pengiriman. Pemilik invoice diperiksa lewat sesi server atau cookie checkout tamu yang masih valid. Form berisi alasan, bank/e-wallet, nama pemilik, dan nomor tujuan. Nilai transaksi diambil dari server; klien tidak dapat mengatur jumlah. Satu invoice hanya memiliki satu tiket pengembalian, termasuk bila permintaan diulang setelah timeout. Invoice sandbox tidak dapat meminta pengembalian uang nyata.

Tiket refund muncul dalam workspace tiket dan chat yang sama. Nilai transaksi di atas Rp50.000 (bukan sama dengan) ditandai wajib admin. Saat ini seluruh penyelesaian refund memerlukan admin utama, origin admin yang benar, dan verifikasi MFA produksi. Terima tiket, catat pemeriksaan, lalu setelah transfer sungguhan selesai isi referensi dan catatan. Penutupan atau penolakan tiket CS tidak mengubah status refund.

Pengiriman yang belum pasti (unknown), sedang diproses, atau telah selesai tidak boleh langsung dinyatakan selesai refund. Periksa hasil supplier dahulu. Pengajuan memberi review_required untuk mencegah pengiriman baru; jangan melepas penahanan tanpa memeriksa tiket refund. Order processing yang sudah dikirim tidak dapat mengajukan melalui form; gunakan tiket bantuan untuk pemeriksaan.

Status completed pada pengajuan adalah catatan admin, bukan konfirmasi bank. Status pembayaran REFUND hanya berasal dari respons Tripay yang terverifikasi. Referensi dan catatan transfer tersimpan di tiket dengan pesan append-only dan log audit admin.
