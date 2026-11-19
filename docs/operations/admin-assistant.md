# Asisten Anres

Asisten menggunakan sesi admin yang sudah ada. Setiap endpoint asisten memerlukan Supabase MFA level `aal2`, termasuk pada server dev yang melonggarkan MFA untuk fungsi admin lain. Chat dan penerapan draf juga memerlukan origin admin yang terdaftar. Agent membatasi tindakan ke bidangnya. Skill membantu model memilih tindakan dalam cakupan tersebut. Izin tetap diperiksa oleh server.

## Aktivasi

1. Terapkan migrasi asisten dengan versi `20261120100000`, `20261120120000`, `20261120140000`, dan `20261120165000`. Deploy API dan dashboard dari rilis yang sama.
2. Isi key provider hanya di lingkungan API. `ADMIN_AI_OPENROUTER_API_KEY`, `ADMIN_AI_GROQ_API_KEY`, dan `ADMIN_AI_GOOGLE_API_KEY` tidak pernah dikirim ke browser. OpenRouter gratis ditemukan dari katalog live jika harga prompt dan completion nol serta mendukung JSON mode.
3. Buka `nano /opt/anresstore/apps/api/.env.production` di VPS Anres. Buat key di [OpenRouter](https://openrouter.ai/keys), [Groq Console](https://console.groq.com/keys), dan [Google AI Studio](https://aistudio.google.com/api-keys). Google menggunakan model text Free Tier yang dicantumkan gratis pada [tabel harga Gemini API](https://ai.google.dev/gemini-api/docs/pricing); `gemini-2.5-flash` akan dialihkan oleh Google ke `gemini-3.5-flash-lite` mulai 1 Desember 2026.

```dotenv
ADMIN_AI_ENABLED=true
ADMIN_AI_OPENROUTER_API_KEY=isi_dengan_key_openrouter_admin
ADMIN_AI_OPENROUTER_MODEL=inclusionai/ling-3.2-flash:free
ADMIN_AI_OPENROUTER_MODELS=
ADMIN_AI_GROQ_API_KEY=isi_dengan_key_groq
ADMIN_AI_GROQ_MODEL=openai/gpt-oss-120b
ADMIN_AI_GROQ_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b
ADMIN_AI_GOOGLE_API_KEY=isi_dengan_key_google_ai_studio
ADMIN_AI_GOOGLE_MODEL=gemini-3.1-flash-lite
ADMIN_AI_GOOGLE_MODELS=gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-2.5-flash-lite,gemini-2.5-flash
ADMIN_AI_AUTO_SWITCH_ENABLED=true
ADMIN_AI_SLOW_RESPONSE_MS=8000
ADMIN_AI_REGISTRY_ENABLED=true
ADMIN_AI_TAVILY_ENABLED=true
TAVILY_API_KEY=isi_dengan_key_tavily
ADMIN_AI_ATTACHMENTS_ENABLED=false
```

4. Buat ulang container API dari direktori proyek agar Compose membaca ulang nilai `env_file`, lalu masuk dengan MFA ke **Utama → Asisten Anres**. Super admin dapat membuka **Pengaturan → Skill & Agent**. Mode demo tersedia di lingkungan pengembangan.

```sh
cd /opt/anresstore
docker compose -p anres-production \
  -f infra/compose.production.yaml \
  -f /opt/anresstore-deploy/compose.cloudflare.yaml \
  up -d --no-deps --force-recreate --wait api
```

5. Aktifkan `ADMIN_AI_ATTACHMENTS_ENABLED=true` jika kebijakan data toko mengizinkan file. Analisis umum menerima tiga file teks UTF-8 TXT, MD, CSV, atau JSON dengan total isi maksimal 8.000 karakter. Lampiran analisis diproses oleh model. Masking membantu menutup pola email, nomor telepon, dan token umum. Admin tetap perlu mengeluarkan informasi rahasia dan pribadi dari pesan atau dokumen.

Pastikan akun Groq tetap pada paket Free; paket Developer menagih penggunaan berdasarkan token. Google harus memakai proyek AI Studio Free Tier, bukan proyek yang ditingkatkan ke Paid. Limit dan ketersediaan model dapat berubah berdasarkan provider. Google menyatakan konten dari Free Tier dapat digunakan untuk meningkatkan produknya; jangan kirim rahasia, data pribadi, atau dokumen sensitif.

Chat dibatasi enam permintaan per menit per admin; tidak ada kuota harian bersama. Jika respons melewati `ADMIN_AI_SLOW_RESPONSE_MS` (default 8 detik) atau provider gagal, server mencoba maksimal dua model cadangan aktif. Matikan dengan `ADMIN_AI_AUTO_SWITCH_ENABLED=false`. Tiap provider diminta dalam waktu ambang yang sama; keseluruhan respons dapat memerlukan beberapa percobaan. Server hanya memakai model yang diaktifkan dan key-nya tersedia.

Tavily menerima maksimal 20 pencarian basic per hari untuk seluruh dashboard. Asisten memakai satu frasa publik dari pesan terbaru. Contoh **Cari di web dokumentasi VIPayment**. Riset publik dan draf perubahan katalog dijalankan di pesan terpisah.

Model utama default adalah Groq `openai/gpt-oss-120b` bila model tersebut tersedia; jika tidak, pemilihan berlanjut ke Google AI Studio, lalu OpenRouter. Pilih model lain untuk pesan berikutnya lewat **Model AI** di kolom chat. Katalog OpenRouter gratis dimuat otomatis dan menampilkan ID `:free` dengan semua harga bernilai nol. ID tambahan di `ADMIN_AI_OPENROUTER_MODELS` boleh diisi manual dan ditandai sebagai tarif standar jika tidak gratis. Groq mengambil model yang tersedia untuk key aktif; `ADMIN_AI_GROQ_MODELS` dapat dipakai menambah ID tertentu. Google memakai daftar Free Tier pada `ADMIN_AI_GOOGLE_MODELS`. Setelah mengubah env, buat ulang container API. Riwayat menampilkan model aktual dan urutan fallback yang digunakan.

## Riwayat dan memori

Mulai percakapan lewat **Chat baru**. Asisten menyimpan sesi saat pesan pertama dikirim. Dari **Riwayat**, buka sesi lama, ubah judulnya, atau hapus sesi beserta pesannya. Satu sesi dapat memuat 100 pasang pesan. Riwayat hanya dapat diakses akun pemilik melalui MFA dan cakupan izin yang sama.

Pesan, waktu, dan tautan sumber disimpan di database Anres. Asisten memakai tiga pasang pesan terbaru sebagai konteks model. Isi lampiran tidak disimpan ke riwayat chat. Gunakan **Riwayat → Memori** untuk menyimpan preferensi bahasa, istilah, atau gaya balasan hingga 1.000 karakter. Preferensi berlaku lintas sesi untuk akun tersebut. Kosongkan catatan dan simpan untuk menghapusnya.

## Skill dan agent

Versi pengaturan tersimpan di database. Super admin dapat memilih skill backend yang aktif, membatasi role, menulis contoh perintah, menyusun instruksi agent, dan menyunting SOP. Izin dasar dari role admin, kategori, dan cakupan produk masih berlaku. Tes rencana menggunakan pengaturan tersimpan dan hanya menampilkan pilihan langkah model. Log pengelola menyimpan label dan status langkah.

Asisten dapat merencanakan maksimal empat langkah berurutan dalam satu pesan. Langkah berikutnya dapat memakai hasil katalog atau status invoice yang sudah diambil. Respons menampilkan riwayat langkah dan tautan hasil pencarian. Rancangan perubahan tetap berada di langkah terakhir dan memerlukan klik konfirmasi.

## Flow pencarian dan edit produk

1. **Tafsirkan target dari pesan terbaru.** Pisahkan kategori, nama produk induk, nama varian/SKU, serta nominal/rentang. Riwayat hanya membantu memahami rujukan konteks seperti produk yang sedang dibahas; riwayat tidak boleh mengganti target eksplisit yang baru disebut.
2. **Cari hanya dalam cakupan target.** Filter kategori/izin terlebih dahulu, lalu cocokkan semua token produk dan varian. Tidak ada fallback ke kategori penuh ketika target tidak cocok. Hasil biasa diurutkan dan dibatasi 10; rentang eksplisit dapat menampilkan hingga 50. Jika lebih banyak yang cocok, minta admin mempersempit.
3. **Tinjau hasil sebelum edit.** Satu kecocokan tepat dapat menjadi draf untuk SKU tersebut. Beberapa kecocokan tanpa instruksi massal hanya menampilkan pilihan dan meminta SKU/cakupan yang benar.
4. **Draf perubahan yang aman.** Edit massal hanya dibuat jika admin meminta semua/rentang dengan jelas, maksimal 50 varian. Draf menampilkan target serta nilai sebelum/sesudah; server memvalidasi izin, versi data, kategori, supplier, dan batas field. Perubahan baru berjalan setelah admin menekan **Terapkan**.
5. **Jika target tidak ditemukan atau ambigu, berhenti dan tanya.** AI tidak memilih produk yang mirip, mengganti SKU, atau mengarang data.

### Impor daftar JSON/CSV

Kirim satu file JSON/CSV atau tempel daftar berheader. Setiap baris wajib memiliki `sku` dan sedikitnya satu perubahan: `harga`, `nama`, `deskripsi`, atau `status`. Format harga rupiah bulat; harga seperti `27.000` diterima. Kolom penjaga `nama_lama`, `produk_lama`, dan `kategori` bersifat opsional.

Contoh JSON: `[{"sku":"ML86","harga":27000,"nama":"86 Diamonds"}]`.

Contoh CSV: `sku,harga,nama` lalu `ML86,27000,86 Diamonds`.

Server mencocokkan SKU secara tepat di katalog tersimpan dan cakupan izin admin. Jika ada SKU hilang, ganda, nama lama berbeda, atau ambigu, server hanya menampilkan laporan baris dan tidak membuat draf. Jika semua baris cocok, server membuat satu draf massal dengan nilai sebelum/sesudah per SKU; perubahan baru berjalan setelah admin menekan **Terapkan**. Maksimal 50 baris per impor. File perlu `ADMIN_AI_ATTACHMENTS_ENABLED=true`; daftar dapat ditempel langsung di chat tanpa mengirim isi daftar ke model.

## Kemampuan

| Tindakan | Sumber Anres | Izin |
|---|---|---|
| Cari produk, lihat promo | Seluruh layanan sumber provider, katalog terkelola, dan jadwal promo | `products.read` serta cakupan kategori/produk. Daftar promo butuh akses semua subproduk dalam kategori. |
| Edit harga, nama, deskripsi, visibilitas, modal, bagian/tab, produk induk, pemetaan supplier, jenis pemrosesan, jumlah paket | Varian tersimpan atau layanan provider yang dipilih | `products.read` dan `products.write` plus cakupan. SKU provider tidak dapat diganti pada varian tersimpan. Aktivasi provider memeriksa kembali supplier dan jumlah paket. |
| Tambah produk/varian manual atau layanan VIPayment | Input lengkap admin atau SKU supplier tersedia | `products.read` dan `products.write` plus cakupan. Produk manual perlu SKU/provider eksplisit; AI tidak mengarang identitas supplier. |
| Sembunyikan, tampilkan/pulihkan, hapus dari katalog, pindahkan varian | Varian kategori dan tujuan produk yang tersedia | `products.read` dan `products.write` plus cakupan. Penghapusan satu varian menandai item tidak aktif dan mengeluarkannya dari checkout baru. |
| Atur promo untuk varian provider atau terkelola | Harga reguler tersimpan, jadwal, dan harga diskon | `products.read` dan `products.write` plus cakupan; promo varian Joki Tugas tidak digunakan karena kategorinya memakai tarif khusus. |
| Atur tarif Joki Tugas | Unit tarif, biaya dasar, tarif per unit/revisi, percepatan, tenggat, dan batas revisi | `products.read` dan `products.write` serta akses kategori `tasks` dan SKU produk manual. |
| Atur ketentuan Aplikasi Premium | Jenis akses, durasi akses, hari garansi, dan ketentuan klaim | `products.read` dan `products.write` serta akses kategori `apps` dan SKU produk manual. |
| Cari invoice dan lihat antrean | API daftar transaksi gabungan, termasuk pesanan reguler, joki, dan premium | Izin `orders.read` atau `payments.read` sesuai daftar, dengan cakupan semua layanan. |
| Ringkas pesanan joki atau premium | Daftar pesanan joki dan aplikasi premium | `orders.read` dan cakupan kategori/produk terkait. |
| Ringkas angka laporan dan status sistem | Analitik dan pemeriksaan antrean server | `orders.read` dan `payments.read` plus semua layanan. |
| Lihat antrian CS, buat draf balasan | Hitungan tiket dan situasi anonim dari admin | `support.read` plus semua layanan. |
| Lihat jumlah voucher terbaru | API voucher | Super admin. Kode dan penerima dilihat di dashboard Voucher. |
| Analisis lampiran teks | Dokumen yang dipilih admin | Sesi MFA dan aktivasi lampiran. |
| Analisis harga, duplikat, dan simulasi promo | Varian terkelola dan modal tercatat | `products.read` plus cakupan. |
| Perubahan harga massal | Target margin/markup atau CSV lokal berheader `sku,harga` | `products.read` dan `products.write` plus cakupan. |
| Kronologi invoice dan rekonsiliasi | Status Anres, audit pembayaran, dan detail Tripay | `orders.read` dan `payments.read` plus semua layanan. |
| Omzet dan margin per kategori | Transaksi lunas pada laporan Anres | `orders.read` dan `payments.read` plus semua layanan. |
| SOP, draf konten, dan ringkasan kasus CS | SOP tersimpan, fakta katalog, dan status invoice terverifikasi | Akses skill dan izin sumber yang relevan. |
| Pencarian publik dan riset supplier | Tavily Search | Sesi MFA, aktivasi Tavily, dan izin skill. |

Perintah perubahan menghasilkan draf 15 menit yang terikat ke akun peminta. Kartu draf menampilkan field sebelum/sesudah; perubahan sampai 50 varian menampilkan SKU satu per satu. Saat **Terapkan perubahan** ditekan, server memeriksa ulang izin dan MFA. Perubahan produk terkelola diperiksa terhadap versi terakhir. Jika penyimpanan batch produk terhenti di tengah, konfirmasi ulang melewatkan varian yang sudah cocok dengan draf dan melanjutkan sisanya. Keputusan kasir, verifikasi pembayaran, refund, pengelolaan akses, QRIS, pengiriman, dan pengiriman pesan ke pelanggan dikerjakan dari fitur dashboard terkait.

Dari **Katalog & harga → Edit varian → Bantu edit**, **Minta draf AI** mengikat permintaan ke varian yang sedang dibuka. Alur ini hanya tersedia untuk varian yang sudah disimpan.

Untuk CSV, pilih **Draf harga massal**, lampirkan satu CSV dengan maksimal 50 baris, lalu ketik **Siapkan draf harga dari CSV**. Server memproses CSV secara lokal dan membatalkan batch jika data SKU tidak valid. Untuk simulasi, coba **Hitung margin produk Mobile Legends di kategori game yang di bawah 10%, lalu siapkan draf harga untuk target margin 15%**.

Model memilih dari daftar tindakan. Server memvalidasi setiap parameter, menyaring data menurut cakupan admin, dan menghitung jawaban operasional dari data Anres. Model tidak menerima isi tiket pelanggan, kontak, saldo provider, atau data gateway dari API internal. Model hanya bisa membuat draf perubahan produk dalam pesan tanpa lampiran. CSV harga mempunyai alur deterministik tersendiri. Draf dan riwayat penerapannya tersimpan di database internal.
