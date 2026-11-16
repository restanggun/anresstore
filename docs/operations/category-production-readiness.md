# Kesiapan alur produksi per kategori

Dokumen ini merangkum perilaku kategori yang harus diverifikasi sebelum layanan
diaktifkan. Implementasi source dan hasil unit test saja tidak membuktikan bahwa
provider, database hosted, dan transaksi VPS siap produksi.

Urutan migrasi fitur dalam repo berakhir di `20261119040000_premium_global_qris.sql`.
Sebelum deploy, bandingkan seluruh timestamp migrasi dengan history hosted dan
schema aktual; terapkan hanya migrasi yang belum terpasang setelah backup dan
uji restore. Runbook deployment menjadi daftar akhir rentang migrasi.

## Game, PPOB, dan media sosial

- Satu jalur checkout: katalog VIPayment -> harga server -> invoice Tripay ->
  callback terverifikasi -> klaim supplier atomik -> polling hasil.
- Setiap varian VIPayment mempunyai pilihan `fulfillment_mode`: `vipayment`
  untuk otomatis, `manual` untuk antrean admin. Produk yang ditahan manual
  tetap dapat dibayar; admin memprosesnya dari antrean setelah status `paid`.
- Perubahan mode hanya berlaku pada order baru. Order yang sudah dibayar
  mempertahankan mode saat checkout agar tidak ada pengiriman ulang.
- Media sosial memakai `supplier_code` terpisah dari SKU paket dan
  `service_quantity` sesuai batas layanan provider.

## Joki tugas

Alur: instruksi tugas dan tautan bahan -> kutipan harga server ->
Tripay -> admin menerima tugas -> admin mengirim hasil -> pelanggan menerima
atau meminta revisi -> admin menerima/menolak revisi dengan alasan -> hasil
revisi -> selesai. Harga harus dibentuk dari tarif per produk yang diatur admin,
jumlah halaman, tenggat, dan jumlah revisi yang dibeli. Kutipan, pilihan, dan
pilihan tarif disimpan sebagai snapshot invoice; perubahan tarif tidak
boleh mengubah pesanan yang telah dibayar. Revisi harus dibatasi kuota yang
dibeli dan hanya boleh diminta setelah hasil dikirim.

Admin mengatur tarif per varian: harga dasar, biaya halaman, harga revisi,
biaya percepatan, dan batas paket. Checkout meminta kutipan server dan
mereservasi rincian tugas atomik bersama invoice Tripay. Halaman admin Joki
menangani mulai kerja, tautan hasil, dan keputusan revisi. Pelanggan melihat
hasil, dapat memakai kuota revisi, atau menyelesaikan tugas dari invoice.
Rancangan ini menerima tautan bahan dan hasil HTTPS; berkas privat yang
diunggah langsung belum didukung. Admin harus memakai tautan dengan izin
akses terbatas sampai penyimpanan berkas privat tersedia.

## Aplikasi premium

Alur yang disyaratkan: aplikasi -> jenis akses/durasi -> order -> QRIS manual
yang diunggah admin -> bukti dan verifikasi pembayaran oleh admin -> kirim
akun melalui kanal privat -> komunikasi kode verifikasi melalui tiket yang
terikat order -> mulai masa garansi -> klaim garansi dengan aturan per produk
-> keputusan admin dan penyelesaian. QRIS manual tidak boleh diberi status
`paid` oleh callback Tripay. Rahasia akun dan kode verifikasi tidak boleh
masuk catatan order umum, log, atau email status; gunakan percakapan privat
dengan otorisasi pemilik order dan staf kategori aplikasi.

Kategori aplikasi hanya memakai varian manual dan tidak mengimpor layanan
game dari VIPayment. Admin mengatur jenis akses, durasi, dan syarat garansi
per varian. Pemesanan membuat order terpisah dari Tripay. Admin mengunggah
QRIS khusus order dengan batas waktu; pelanggan mengunggah bukti, dan admin
memverifikasi mutasi sebelum membuka tiket privat untuk pengiriman akun.
Klaim garansi hanya dapat diajukan dalam masa garansi dari waktu pengiriman.
Gambar QRIS dan bukti dibatasi 100 KB dan disimpan di tabel yang hanya dapat
diakses service role; API memeriksa kepemilikan order.

## Gerbang rilis VPS

1. Isi tarif joki dan ketentuan aplikasi untuk setiap varian yang akan dijual.
   Pastikan tautan bahan/hasil yang digunakan staf membatasi akses penerima.
2. Uji replay migrasi dan seluruh test API/web/admin dari checkout hingga
   keputusan admin; tambah uji callback duplikat, klaim ganda, dan batas revisi.
3. Audit migrasi remote, backup dan uji restore, lalu deploy API dan UI dari
   satu commit release. Jangan mendorong migrasi fitur yang belum didukung UI.
4. Uji satu transaksi kecil per kategori di domain publik dan rekonsiliasi
   nominal, biaya, status provider, serta laporan admin. Uji pause otomatis
   per varian dan pause global supplier.
5. Aktifkan kategori satu per satu setelah jalur alert dan PIC operasional
   diuji. Siapkan prosedur refund dan sengketa untuk pembayaran manual.
