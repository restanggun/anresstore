import { ArrowDown, CodeXml, ReceiptText } from "lucide-react";
import { Button } from "@anres/ui";
import Link from "@/components/storefront/domain-link";
import { publicPageMetadata } from "@/lib/seo";
import styles from "./reseller.module.css";

export const metadata = publicPageMetadata(
  "web",
  "/reseller",
  "Program Reseller | Anres Store",
  "Kenali rencana program reseller Anres Store, cara aktivasi, contoh harga, dan level reseller.",
);

const activationSteps = [
  ["Ajukan pendaftaran", "Masuk ke akun Anres dan ajukan pendaftaran dengan nama toko serta nomor WhatsApp."],
  ["Tunggu persetujuan", "Tim Anres meninjau pengajuan. Setelah disetujui, kamu bisa membuat pesanan aktivasi."],
  ["Selesaikan pesanan pertama", "Belanja minimal Rp100.000 untuk produk yang memenuhi syarat, setelah diskon dan sebelum biaya pembayaran. Akses reseller aktif setelah pembayaran terverifikasi dan pesanan selesai."],
] as const;

const levels = [
  ["Starter", "Harga reseller untuk produk yang memenuhi syarat dan akses ke dashboard pesanan."],
  ["Pro", "Harga lebih rendah pada produk tertentu dan kuota API lebih tinggi."],
  ["Partner", "Harga terbaik pada produk yang memenuhi syarat dan kuota API tertinggi."],
] as const;

export default function ResellerPage() {
  return (
    <main id="main" className={`container ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="reseller-title">
        <div className={styles.heroCopy}>
          <p className={styles.status}>Pendaftaran belum dibuka</p>
          <h1 id="reseller-title">Program Reseller Anres Store</h1>
          <p>Jual top up dan produk digital dengan harga reseller. Pesan untuk pelangganmu dari satu akun Anres.</p>
          <Button asChild><a href="#cara-bergabung">Lihat cara bergabung <ArrowDown aria-hidden="true" /></a></Button>
        </div>
        <section id="perbandingan-harga" tabIndex={-1} className={styles.priceCard} aria-labelledby="price-title">
          <div className={styles.priceHeading}>
            <span className={styles.icon}><ReceiptText aria-hidden="true" size={23} /></span>
            <h2 id="price-title">Contoh perbandingan harga</h2>
          </div>
          <p>Ilustrasi untuk satu produk digital yang sama.</p>
          <dl className={styles.prices}>
            <div><dt>Harga publik</dt><dd>Rp25.000</dd></div>
            <div><dt>Harga reseller</dt><dd>Rp23.500</dd></div>
            <div className={styles.priceDifference}><dt>Selisih sebelum biaya</dt><dd>Rp1.500</dd></div>
          </dl>
          <p>Harga aktual mengikuti produk dan level reseller saat checkout.</p>
        </section>
      </section>

      <section id="cara-bergabung" tabIndex={-1} className={styles.section} aria-labelledby="activation-title">
        <div className={styles.sectionIntro}>
          <h2 id="activation-title">Cara bergabung</h2>
          <p>Rencananya pendaftaran gratis dengan minimum pembelian satu kali untuk aktivasi. Setelah aktif, kamu bisa pesan satuan.</p>
        </div>
        <ol className={styles.steps}>
          {activationSteps.map(([title, description]) => (
            <li key={title}><h3>{title}</h3><p>{description}</p></li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="orders-title">
        <div className={styles.sectionIntro}>
          <h2 id="orders-title">Pesan untuk pelangganmu</h2>
          <p>Saat program dibuka, pelanggan membayar ke tokomu. Kamu memasukkan tujuan pengiriman produk di Anres dan membayar harga reseller. Anres memproses produk ke tujuan tersebut dan mencatat invoice serta statusnya di dashboard reseller.</p>
        </div>
        <div className={styles.integration}>
          <span className={styles.icon}><CodeXml aria-hidden="true" size={23} /></span>
          <div>
            <h3>API untuk website tokomu</h3>
            <p>Setelah fitur API tersedia, reseller aktif bisa melihat katalog, membuat pesanan, dan memeriksa status pesanan tokonya lewat integrasi server.</p>
          </div>
        </div>
      </section>

      <section id="level-reseller" tabIndex={-1} className={styles.section} aria-labelledby="levels-title">
        <div className={styles.sectionIntro}>
          <h2 id="levels-title">Level reseller</h2>
          <p>Rencananya, level reseller mengikuti transaksi reseller yang selesai dalam 90 hari terakhir. Pembeli bisa naik tier lewat Misi Permanen dan mengajukan akses reseller lewat pendaftaran program.</p>
        </div>
        <ul className={styles.levels}>
          {levels.map(([title, description]) => (
            <li key={title}><h3>{title}</h3><p>{description}</p></li>
          ))}
        </ul>
      </section>

      <section className={styles.help} aria-labelledby="reseller-help-title">
        <h2 id="reseller-help-title">Ada pertanyaan soal reseller?</h2>
        <Button asChild><Link href="/bantuan#support-inbox">Hubungi CS</Link></Button>
      </section>
    </main>
  );
}
