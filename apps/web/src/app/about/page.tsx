import { storeSummary } from "@/lib/store-copy";
import { categoryInfo } from "@/lib/storefront";
import { catalogDescription, publicPageMetadata } from "@/lib/seo";
import Link from "@/components/storefront/domain-link";
import { ArrowRight, Gamepad2, FileText, Smartphone } from "lucide-react";
import { Button } from "@anres/ui";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { TextLink } from "@/components/storefront/text-link";
export const metadata = publicPageMetadata("web", "/about", "Tentang Anres Store", catalogDescription);
export default function AboutPage() {
 return <main id="main" className="container about-page">
  <section className="about-intro"><div><p className="section-kicker">Tentang Anres Store</p><h1><TextGenerateEffect as="span" words="Kebutuhan digital" className="about-headline-line" duration={0.3}/><TextGenerateEffect as="span" words="dalam satu tempat." className="about-headline-line" duration={0.3} delay={0.12}/></h1><p className="page-description">{storeSummary}</p><Button asChild><Link href="/katalog">Jelajahi katalog<ArrowRight size={17} aria-hidden="true"/></Link></Button></div><div className="about-visual" aria-hidden="true"><img src="/logo.svg" width="90" height="106" alt=""/><span className="about-word">anres.</span><div className="about-stamps"><span><Gamepad2 size={21}/></span><span><FileText size={21}/></span><span><Smartphone size={21}/></span></div></div></section>
  <section className="about-story"><h2>Cara berbelanja di Anres Store</h2><div><p>Cari layanan di Katalog. Di halaman produk, kamu bisa melihat pilihan paket, harga, dan ketentuan sebelum memesan.</p><p>Saat checkout, periksa detail pesanan dan ikuti petunjuk pembayaran yang ditampilkan. Gunakan Invoice untuk memantau pembayaran dan proses pesanan.</p></div></section>
  <section className="service-directory"><div><h2>Layanan Anres Store</h2></div><div className="directory-grid">{categoryInfo.map(({icon:Icon,name:title,description},index)=><div className="directory-row" key={title}><span className="directory-icon"><Icon size={21} aria-hidden="true"/></span><div><h3><TextGenerateEffect as="span" words={title} duration={0.22} delay={index*0.025}/></h3><p>{description}</p></div></div>)}</div></section>
  <section className="help-strip"><div><h2>Butuh bantuan?</h2><p>Cari jawaban di Pusat Bantuan atau buat tiket untuk menghubungi tim CS.</p></div><TextLink href="/bantuan">Buka pusat bantuan</TextLink></section>
 </main>;
}
