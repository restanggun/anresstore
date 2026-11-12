import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, FileText, Smartphone, AppWindow, Users } from "lucide-react";
import { Button } from "@anres/ui";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { TextLink } from "@/components/storefront/text-link";
export const metadata: Metadata = {title:"Tentang | Anres Store",description:"Kenali Anres Store dan layanan digital yang sedang kami siapkan."};
const areas = [
  [Gamepad2,"Waktu main","Kebutuhan top up Mobile Legends, Free Fire, dan Roblox."],
  [AppWindow,"Ruang berkarya","Aplikasi premium untuk kebutuhan desain dan produktivitas."],
  [Smartphone,"PPOB","Pilihan pulsa, paket data, dan token listrik."],
  [Users,"Booster media sosial","Informasi layanan untuk kebutuhan akun media sosial."],
  [FileText,"Tugas dan presentasi","Bantuan format dokumen agar lebih tertata dan mudah dibaca."],
] as const;
export default function AboutPage() {
 return <main id="main" className="container about-page">
  <section className="about-intro"><div><p className="section-kicker">Tentang Anres Store</p><h1><TextGenerateEffect as="span" words="Digital buat" className="about-headline-line" duration={0.3}/><TextGenerateEffect as="span" words="keseharianmu." className="about-headline-line" duration={0.3} delay={0.12}/></h1><p className="page-description">Ada waktu buat main, ada waktu buat berkarya. Kami ingin kebutuhan digitalmu lebih mudah ditemukan, di satu tempat.</p><Button asChild><Link href="/katalog">Jelajahi layanan<ArrowRight size={17} aria-hidden="true"/></Link></Button></div><div className="about-visual" aria-hidden="true"><img src="/logo.svg" width="90" height="106" alt=""/><span className="about-word">anres.</span><div className="about-stamps"><span><Gamepad2 size={21}/></span><span><FileText size={21}/></span><span><Smartphone size={21}/></span></div><span className="about-caption">Game. Karya. Keseharian.</span></div></section>
  <section className="about-story"><h2>Berangkat dari <br/>kebutuhan yang dekat.</h2><div><p>Top up game, cari aplikasi untuk tugas, atau isi paket data. Hal-hal kecil yang jadi bagian dari keseharian digital kita.</p><p>Anres Store sedang menyiapkan layanan untuk kebutuhan itu. Fokus kami: pilihan yang mudah dijelajahi dan informasi produk yang jelas sebelum kamu memutuskan.</p><p className="subtle-note">Saat ini website masih dalam tahap pratinjau. Produk, harga, dan ketentuan akan ditampilkan setelah siap.</p></div></section>
  <section className="service-directory"><div><h2>Apa yang kami siapkan?</h2><p className="muted-copy">Lima bagian dari hari digitalmu.</p></div><div className="directory-grid">{areas.map(([Icon,title,description],index)=><div className="directory-row" key={title}><span className="directory-icon"><Icon size={21} aria-hidden="true"/></span><div><h3><TextGenerateEffect as="span" words={title} duration={0.22} delay={index*0.025}/></h3><p>{description}</p></div></div>)}</div></section>
  <section className="help-strip"><div><h2>Kenali layanannya dulu.</h2><p>Detail yang kamu butuhkan ada di katalog dan pusat bantuan.</p></div><TextLink href="/bantuan">Buka pusat bantuan</TextLink></section>
 </main>;
}
