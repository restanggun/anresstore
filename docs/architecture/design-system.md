# Sistem UI Anres Store

Dokumen ini mencatat UI storefront yang disepakati pada landing, Tentang, Bantuan, dan auth. Gunakan tampilan halaman tersebut serta file sumber yang dirujuk sebagai acuan ketika membuat halaman baru. Katalog mengikuti aturan visual yang sama; data produk, harga, dan pembayaran pada alur pesanan masih berupa simulasi sampai backend tersedia.

## Sumber tema

Token global berada di `packages/ui/src/styles.css`, diimpor oleh `apps/web/src/app/globals.css`. `@theme inline` memetakan token yang sama ke Tailwind. Ubah token di sumbernya, bukan menambahkan warna baru untuk setiap halaman.

| Kebutuhan | Token | Nilai |
| --- | --- | --- |
| Latar / permukaan | `--background`, `--surface` | `#ffffff` |
| Teks utama | `--foreground` | `#17191c` |
| Teks sekunder | `--muted` | `#5b626b` |
| Garis pemisah | `--border` | `#e3e7eb` |
| Biru utama | `--primary` | `#a9ddf7` |
| Biru hover | `--primary-hover` | `#8dcef0` |
| Biru lembut | `--primary-soft` | `#eaf6fd` |
| Pink utama | `--pink` | `#ffb5d5` |
| Pink lembut | `--pink-soft` | `#fff0f6` |
| Teks pada pink | `--pink-ink` | `#7b3455` |
| Fokus | `--focus`, `--field-focus` | `#24658a` |
| Border input | `--field-border` | `#cfd8df` |

Warna biru dan pink berupa bidang solid. Putih dan warna teks gelap memberi ruang dan kontras. Gunakan garis secara hemat: utamakan perbedaan warna permukaan untuk memisahkan kartu. Hindari gradient, efek glow, dan dekorasi yang mengganggu isi. Ilustrasi boleh memakai aset merek sesuai sumbernya; lihat `apps/web/public/brand/README.md`.

## Tipografi dan bentuk

- **Manrope Variable** adalah font utama, dibundel lokal melalui `@fontsource-variable/manrope`; fallback Segoe UI dan Arial. Judul tebal, body nyaman dibaca, dan label kontrol memakai bobot semibold atau bold.
- Gunakan ukuran responsif dari halaman yang sejenis. Judul hero besar dan rapat, deskripsi lebih kecil dengan line-height lega. Jangan mengubah semua teks menjadi uppercase atau menambahkan label dekoratif yang tidak diperlukan.
- Sudut membulat adalah ciri utama: kartu besar sekitar 24–36 px, kartu kecil sekitar 18–24 px, dan kontrol sekitar 13–16 px. Radius dan padding harus seimbang; gunakan bentuk yang sudah ada sebelum membuat ukuran baru.
- Ikon memakai `lucide-react` dengan ukuran dan ketebalan sesuai konteks. Ikon dekoratif diberi `aria-hidden`; kontrol dengan ikon saja wajib memiliki nama yang bisa dibaca pembaca layar.

## Komponen yang dipakai ulang

| Kebutuhan | Komponen / lokasi | Cara pakai |
| --- | --- | --- |
| Tombol | `Button` dari `@anres/ui` atau `@/components/ui/button` | Gunakan `asChild` untuk Next `Link`, dan `variant="outline"` untuk aksi sekunder. Style hover dan active storefront ada di `globals.css`; cek konteks sebelum menambah override. |
| Input | `@/components/ui/input` | Gunakan label yang terhubung dengan `htmlFor`, `name`, `autoComplete`, dan pesan validasi. Field memakai border 1 px; fokus menggunakan outline 2 px dan offset 2 px dari token fokus. Kotak pencarian memberi outline pada wadah, bukan dua outline bertumpuk. |
| Link aksi teks | `@/components/storefront/text-link` | Gunakan `<TextLink href="/bantuan">Buka bantuan</TextLink>` untuk link dengan panah kanan seperti di landing, Tentang, dan Bantuan. |
| FAQ | `@/components/storefront/faq-list` | Beri `items` berupa pasangan pertanyaan/jawaban. `animateQuestions` hanya untuk tampilan yang memang memakai animasi teks; perilaku accordion dan keyboard tetap memakai Radix. |
| Animasi masuk | `@/components/ui/use-reveal` | Dalam client component, panggil `const reveal = useReveal()` lalu gunakan `<motion.section {...reveal()}>`. Delay opsional dalam detik. Hook mempertahankan elemen semantik dan menghormati reduced motion. |
| Judul beranimasi | `@/components/ui/text-generate-effect` | Untuk judul atau nama kartu yang sudah mengikuti pola blur teks; tetap sediakan teks yang dapat dibaca pembaca layar. Jangan mengulang animasi pada seluruh kata hanya sebagai hiasan. |
| Ilustrasi layanan | `@/components/storefront/service-illustration` | Gunakan nama kategori dari `categoryInfo`; `featured` untuk slot hero. Beri ruang sendiri untuk ilustrasi agar tidak bertumpuk dengan judul dan CTA. |
| Kartu produk katalog | `@/components/storefront/catalog-product-card` | Gunakan untuk daftar produk kategori dan produk populer; komponen menangani ilustrasi merek yang tersedia, fallback ikon, animasi masuk, hover, dan tap. |
| Keranjang | `@/components/storefront/cart-popup` | Gunakan dialog bersama dari shell; pertahankan data lokal dan penanda simulasi selama transaksi belum terhubung. |
| Logo dan shell | `Brand`, `SiteShell` di `components/storefront` | Gunakan satu logo dan navigasi bersama. Auth memakai layout tanpa navbar dengan link kembali ke katalog. |
| Primitive UI | `apps/web/src/components/ui` | Accordion, Dialog, Tabs, Tooltip, dan komponen shadcn/Radix lain dipakai sesuai fungsi; jangan membuat primitive baru bila yang ada sudah mencukupi. |

## Pola interaksi

- Navbar awalnya berbentuk rounded dengan jarak luar. Saat scroll, latar melebar penuh dan menyisakan border bawah; posisi konten navigasi tetap stabil. Login berwarna pink, Daftar biru; hover saling bertukar dan active biru.
- Kartu kategori memakai bidang solid, thumbnail dengan warna berbeda dari kartu, judul dan keterangan yang jelas, lalu satu link aksi. Pada hover kartu boleh menjadi pink solid dan bergerak sedikit. Pastikan ilustrasi dan logo tidak terpotong pada ponsel.
- Animasi masuk memakai Motion: opacity, sedikit pergeseran, dan blur ringan. Kartu kategori masuk bertahap dan punya hover/tap halus. Pengaturan `prefers-reduced-motion` harus menghilangkan atau mempercepat gerakan, tanpa menyembunyikan konten.
- Auth dimulai dari email, tanpa navbar, dan menyimpan email saat berpindah langkah. Status akun, Google, dan OTP masih pratinjau sampai backend terhubung; jangan menampilkan keberhasilan palsu atau menyiratkan kode sudah dikirim.
- Sajikan status kosong, error, loading, dan disabled dengan jelas. Jangan mengandalkan warna saja untuk menjelaskan status. Pertahankan fokus keyboard yang terlihat, label input, urutan heading, dan target sentuh yang nyaman.

## Layout dan pemeriksaan

`.container` mengatur lebar konten bersama; jangan menambah margin luar berbeda pada setiap halaman. Navbar didefinisikan di `navbar.css`, komposisi landing di `landing.css`, dan penyesuaian halaman serta komponen di `page-design.css`. Stylesheet terakhir dimuat setelah `globals.css`, sehingga aturan di sana dapat menimpa aturan awal; periksa cascade sebelum mengubah token atau menambah selector.

Katalog memakai `catalog-flow.css` untuk alur yang ada dan `catalog-system.css` untuk penyelarasan visual. Langkah pesanan menggunakan `Button`, `Input`, indikator tahap, dan ringkasan yang sama; perubahan langkah membawa pengguna kembali ke bagian progres. Harga dan invoice harus tetap ditandai sebagai contoh sampai alur nyata tersambung.

Pertahankan dua kolom hanya bila ruang cukup. Pada ponsel, tumpuk panel, kurangi padding, pastikan grid dan ilustrasi muat, dan hindari scroll horizontal. Periksa minimal lebar 320, 390, 768, 1024, dan 1440 px, juga keyboard, reduced motion, dan isi yang panjang. Tinjau di browser sesudah perubahan visual; build memeriksa kompilasi tetapi tidak menggantikan pemeriksaan tampilan.

## Contoh penggunaan

```tsx
import Link from "next/link";
import { Button } from "@anres/ui";
import { TextLink } from "@/components/storefront/text-link";
import { FaqList } from "@/components/storefront/faq-list";

<Button asChild><Link href="/katalog">Jelajahi katalog</Link></Button>
<TextLink href="/bantuan">Lihat bantuan</TextLink>
<FaqList items={questions} />
```

Sebelum membuat variasi baru, cari komponen yang sudah ada. Komponen khusus halaman tetap boleh dibuat bila struktur atau perilakunya memang berbeda; catat aturan baru di dokumen ini setelah desainnya disepakati.
