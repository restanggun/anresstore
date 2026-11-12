# Arah UI Anres Store

UI baru menggunakan biru dan pink solid. PDF brand menjadi referensi konteks bisnis, bukan aturan visual mutlak.

## Token
- Biru langit #A9DDF7, hover #8DCEF0, soft #EAF6FD. Fokus keyboard #24658A.
- Pink lembut cerah #FFB5D5, soft #FFF0F6, teks pink #7B3455.
- Background dan surface #FFFFFF, teks #17191C, sekunder #5B626B, border #E3E7EB.
- Token sumber: packages/ui/src/styles.css. Tombol: packages/ui/src/button.tsx.
- Manrope Variable (self-hosted melalui @fontsource-variable/manrope), subset sesuai unicode-range, bobot 200-800. Heading 700-800, body 400-500, kontrol 600-700. Fallback Segoe UI/Arial. Heading rapat, body lega.
- Radius bertingkat: kontrol 12-16px, kartu 20-24px, panel utama 28-32px.

## Aturan desain
- Tanpa gradient, glassmorphism, glow, bayangan besar, atau animasi dekoratif.
- Biru langit dan pink menjadi bidang warna solid. Tombol utama hero gelap; teks gelap di atas pastel. Warna pastel tidak dipakai sebagai teks di atas putih.
- Dahulukan katalog dan pencarian. Setiap bagian harus membantu memilih layanan atau memahami proses.
- Jangan mengulang semua konten sebagai kartu identik. Gunakan grid untuk produk, daftar bernomor untuk alur, disclosure untuk FAQ.
- Hindari badge berlebihan, pill untuk semua elemen, emoji sebagai ikon, statistik palsu, testimonial buatan, dan klaim instan/termurah/24 jam tanpa bukti.
- Gunakan bahasa Indonesia yang singkat, konkret, dan santai tanpa slogan berulang.
- Inisial pada katalog saat ini adalah placeholder tipografi, bukan logo produk resmi. Ganti dengan aset berizin ketika tersedia.
- Fokus keyboard terlihat, label input wajib, tombol filter memakai aria-pressed, dialog bisa ditutup dengan Escape, dan reduced motion dihormati.
- Jaga keterbacaan pada layar kecil. Navigasi, filter, dan tombol harus bisa dipakai tanpa hover.

## Status implementasi
Website memiliki halaman Beranda (/), Katalog (/katalog), Tentang (/about), Bantuan (/bantuan), Login (/login), dan Daftar (/daftar). Katalog menyediakan pencarian, filter, dan dialog layanan; Bantuan menyediakan pencarian FAQ. Login/Daftar adalah UI pratinjau dengan validasi lokal dan tidak mengirim kredensial. Isi katalog adalah pratinjau cakupan layanan; tidak memuat harga atau transaksi aktif. Alur pembayaran, akun, dan status pesanan belum diimplementasikan. Logo web memakai varian hitam dari brand/logo.svg tanpa mengubah geometri; aset asli tetap dipertahankan. Navbar sticky memakai menu disclosure di mobile. Admin baru mengikuti token bersama; dashboard operasional tetap menunggu implementasi.

Skill frontend-design Anthropic sudah dipasang untuk panduan desain. Toolkit shadcn/Radix, Motion, Lucide, serta komponen pilihan Magic UI dan Aceternity tersedia. Kualitas tetap dijaga lewat review visual, aksesibilitas, dan konten terverifikasi. Detail: docs/architecture/frontend-toolkit.md.

## Brand lettering dan motion
Logo SVG tetap hitam. Teks Anres dan Store memakai hitam #000000 atas permintaan terbaru pemilik. Anres berbobot 800 dan Store berbobot 300. Setelah Store ada titik kotak 5px berwarna pink.
Transisi halaman 220ms, menu mobile 160ms, respons hover/press 160-200ms. Ilustrasi controller dan dokumen hanya bergerak saat hover (y -5px, rotasi 2 derajat) dengan spring; tidak ada gerakan idle otomatis. Reduced motion menonaktifkan gerakan dekoratif. Jangan menambahkan animasi masuk ke setiap section. Navbar dan footer dipakai bersama; aria-current menandai halaman aktif.

## Status tombol dan navbar
Login normal pink; Daftar normal biru langit. Hover tombol akun saling bertukar: Login pink menjadi biru, Daftar biru menjadi pink. Status tekan/halaman aktif biru langit; halaman aktif diprioritaskan di atas hover. Berlaku untuk navbar, aksi form akun, serta tombol utama. Tombol akun mobile ditata berdampingan.
Navbar berubah dari rounded dengan margin menjadi full-width tanpa radius dan hanya border bawah saat scrollY >16px, dengan easing 280ms. Ruang layout header tetap agar konten tidak bergeser. Kembali ke atas mengembalikan bentuk awal; reduced motion mematikan transisi.

## Navbar reviewed implementation
Aturan navbar terpusat di apps/web/src/app/navbar.css. Tinggi panel dalam 70px desktop / 66px mobile, jarak luar atas-bawah 16px; kontrol minimal 44px. Menu desktop memakai grid tengah; pada lebar <=900px diganti disclosure mobile. Hanya bingkai yang berubah saat scroll; posisi isi tetap. Transisi halaman menggunakan CSS agar konten tidak tersembunyi saat animasi client tidak berjalan.

Landing utama memakai susunan hero lintas layanan, lima pintasan kategori, empat contoh layanan yang beragam, panduan memilih, FAQ, dan CTA katalog. Style khusus di apps/web/src/app/landing.css. Keterangan pratinjau tetap ditampilkan; jangan menambahkan statistik, testimoni, atau klaim instan tanpa data terverifikasi.
