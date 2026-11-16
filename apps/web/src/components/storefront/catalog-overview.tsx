"use client";
import { ServiceCategoryGrid } from "./service-category-grid";
export function CatalogOverview() {

 return <section className="landing-services catalog-overview" aria-labelledby="catalog-services-title">
  <div className="section-heading"><div><h2 id="catalog-services-title">Cari yang kamu perlukan.</h2><p>Lima kategori yang mencakup kebutuhan digital sehari-hari.</p></div></div>
  <ServiceCategoryGrid />
  <div className="catalog-overview-guide" aria-label="Cara memilih layanan"><div><strong>Temukan kategorinya</strong><p>Pilih salah satu dari lima kategori atau gunakan pencarian katalog.</p></div><div><strong>Periksa pilihan produk</strong><p>Buka kartu produk untuk melihat keterangan, pilihan, dan harga dari server.</p></div><div><strong>Lanjutkan pesanan</strong><p>Periksa data tujuan dan pembayaran sebelum menyelesaikan pesanan.</p></div></div>
 </section>;
}

