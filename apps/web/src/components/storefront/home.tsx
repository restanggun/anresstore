"use client";

import Link from "@/components/storefront/domain-link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@anres/ui";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Search, ShieldCheck, Star, UserRoundPlus, LogIn } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Input } from "@/components/ui/input";
import { useReveal } from "@/components/ui/use-reveal";
import { categoryInfo } from "@/lib/storefront";
import { ServiceIllustration } from "./service-illustration";
import { ServiceCategoryGrid } from "./service-category-grid";
import { FaqList } from "./faq-list";
import { TextLink } from "./text-link";

const guide = [
  {icon:Search,title:"Temukan kategorinya",description:"Gunakan pencarian atau pilih salah satu dari lima kategori layanan.",href:"/katalog",action:"Cari layanan"},
  {icon:BookOpenCheck,title:"Baca ringkasan layanan",description:"Periksa keterangan produk dan ketentuan yang tersedia sebelum memilih.",href:"/katalog",action:"Lihat katalog"},
  {icon:ShieldCheck,title:"Ketahui statusnya",description:"Periksa pilihan, harga, dan data tujuan sebelum melanjutkan ke checkout.",href:"/bantuan",action:"Baca pusat bantuan"},
];
const faq = [
  ["Apakah sudah bisa memesan di website ini?","Pilih produk dari katalog, lengkapi data tujuan, lalu ikuti informasi pada halaman checkout."],
  ["Perlu akun untuk melihat katalog?","Tidak. Katalog dan informasi layanan dapat dijelajahi tanpa akun."],
  ["Layanan apa saja yang tersedia?","Jelajahi top up game, format tugas, booster media sosial, aplikasi premium, dan PPOB."],
] as const;
const categoryUrl = (category:string) => `/katalog?kategori=${encodeURIComponent(category)}`;
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
type LandingData = {
  config: { announcementEnabled:boolean; announcementText:string; announcementHref:string; announcementLabel:string; announcementMoving:boolean; startsAt:string|null; endsAt:string|null; closingTitle:string; closingBody:string; showAuthCta:boolean };
  stats: { transactionCount:number; averageRating:number; reviewCount:number; recentReviews:{id:string;rating:number;comment:string;category:string;productSlug:string;createdAt:string;author:string}[] };
};

function LandingHero({ showAuthCta }: { showAuthCta:boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = categoryInfo[activeIndex] ?? categoryInfo[0];
  const heroRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const reveal = useReveal();
  useEffect(() => {
    if (reduce) return;
    const hover = window.matchMedia("(any-hover: hover)");
    const timer = window.setInterval(() => {
      const hero = heroRef.current;
      if (!hero || document.hidden || hero.matches(":focus-within") || (hover.matches && hero.matches(":hover"))) return;
      setActiveIndex(index => (index + 1) % categoryInfo.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [reduce]);
  return <section ref={heroRef} className="hero landing-hero landing-hero-switch" aria-labelledby="hero-title">
      <motion.div className="landing-hero-copy" {...reveal()}>
        <h1 id="hero-title"><TextGenerateEffect as="span" words="Satu tempat," className="landing-headline-line" duration={.34}/><TextGenerateEffect as="span" words="banyak kebutuhan." className="landing-headline-line" duration={.34} delay={.12}/></h1>
        <p>Temukan pilihan untuk bermain, berkarya, terhubung, dan memenuhi kebutuhan digital harian.</p>
        <div className="landing-hero-actions"><Button asChild><Link href={categoryUrl(current.name)}>Jelajahi {current.name}<ArrowRight size={18}/></Link></Button><Link href="/about" className="landing-secondary">Kenali Anres</Link></div>
        {showAuthCta && <div className="landing-auth-actions"><Button asChild><Link href="/daftar"><UserRoundPlus size={17}/>Buat akun</Link></Button><Link href="/login" className="landing-auth-login"><LogIn size={16}/>Sudah punya akun? Login</Link></div>}
      </motion.div>
      <motion.div key={current.name} className={`landing-hero-art landing-hero-art-${current.art}`} role="group" aria-label={current.name} initial={reduce ? false : { opacity: .65, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.22, 1, .36, 1] }}>
        <span className="landing-art-kicker">{current.detail}</span>
        <div className="landing-art-visual"><ServiceIllustration categoryName={current.name} featured/></div>
        <div className="landing-art-caption"><TextGenerateEffect as="h2" words={current.title} duration={.25}/><p>{current.description}</p></div>
        <Link href={categoryUrl(current.name)} className="landing-art-link">Lihat kategori<ArrowUpRight size={18}/></Link>
      </motion.div>
  </section>;
}

export function HomeContent() {
  const reveal = useReveal();
  const [landing, setLanding] = useState<LandingData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/storefront/landing`, { signal:controller.signal, cache:"no-store" })
      .then(response => response.ok ? response.json() as Promise<LandingData> : Promise.reject(new Error("Landing data unavailable")))
      .then(setLanding).catch(() => {});
    return () => controller.abort();
  }, []);
  const showAuthCta = landing?.config.showAuthCta ?? true;
  return <main id="main" className="container landing-page">
    <LandingHero showAuthCta={showAuthCta} />
    <section className="landing-services" aria-labelledby="services-title"><motion.div className="section-heading" {...reveal()}><div><h2 id="services-title">Cari yang kamu perlukan.</h2><p>Lima kategori yang mencakup kebutuhan digital sehari-hari.</p></div><form className="landing-search" role="search" action="/katalog"><label className="sr-only" htmlFor="landing-search">Cari layanan</label><Search size={19}/><Input id="landing-search" name="q" type="search" placeholder="Cari game atau layanan"/><Button type="submit" aria-label="Cari layanan"><ArrowRight size={18}/></Button></form></motion.div>
    <ServiceCategoryGrid /></section>
    {landing && <motion.section className="landing-proof" aria-labelledby="proof-title" {...reveal()}>
      <div className="landing-proof-head"><div><span className="landing-proof-kicker">ANRES, MENURUT PELANGGAN</span><h2 id="proof-title">Pilihan nyata. Cerita nyata.</h2><p>Angka transaksi dan ulasan dihitung dari data Anres yang sudah terverifikasi.</p></div><Link href="/katalog" className="landing-proof-link">Jelajahi katalog<ArrowRight size={16}/></Link></div>
      <div className="landing-proof-grid">
        <article className="landing-stat-card"><span>Transaksi berhasil</span><strong>{new Intl.NumberFormat("id-ID").format(landing.stats.transactionCount)}</strong><small>Pesanan lunas, termasuk layanan premium yang sudah terkirim.</small></article>
        <article className="landing-stat-card landing-rating-stat"><span>Rating produk</span><strong>{landing.stats.reviewCount ? landing.stats.averageRating.toFixed(1).replace(".", ",") : "—"}<Star size={20} fill="currentColor" aria-hidden="true"/></strong><small>{new Intl.NumberFormat("id-ID").format(landing.stats.reviewCount)} ulasan yang sudah ditinjau admin.</small></article>
        <div className="landing-review-list" aria-label="Ulasan terbaru">
          {landing.stats.recentReviews.length ? landing.stats.recentReviews.map(review => <article className="landing-review-card" key={review.id}>
            <div className="landing-review-top"><span>{review.author}</span><span className="landing-review-stars" aria-label={`${review.rating} dari 5 bintang`}>{Array.from({length:5},(_,index)=><Star key={index} size={13} fill={index<review.rating?"currentColor":"none"} aria-hidden="true"/>)}</span></div>
            <p>{review.comment}</p><Link href={`/katalog/${encodeURIComponent(review.category)}/${encodeURIComponent(review.productSlug)}`}>{review.productSlug.replaceAll("-"," ")}<ArrowUpRight size={13}/></Link>
          </article>) : <article className="landing-review-empty"><Star size={18} aria-hidden="true"/><strong>Ulasan pelanggan segera hadir.</strong><span>Setiap ulasan ditinjau sebelum ditampilkan di sini.</span></article>}
        </div>
      </div>
    </motion.section>}
    <section className="landing-guide" aria-labelledby="guide-title"><motion.div className="guide-intro" {...reveal()}><div className="guide-brand" aria-hidden="true"><img src="/logo.svg" alt="" width="37" height="44"/></div><h2 id="guide-title">Kenali layanannya.<br/>Pilih dengan tenang.</h2><p>Kebutuhan digital tidak selalu sama. Mulai dari informasi yang jelas untuk menemukan pilihan yang tepat.</p><TextLink href="/about">Tentang Anres Store</TextLink></motion.div><ol className="guide-steps">{guide.map(({icon:Icon,title,description,href,action},index)=><motion.li key={title} {...reveal(index*.08)}><span className="guide-step-icon"><Icon size={22}/></span><div><h3>{title}</h3><p>{description}</p><Link href={href}>{action}<ArrowUpRight size={15}/></Link></div></motion.li>)}</ol></section>
    <motion.section className="landing-faq" aria-labelledby="faq-title" {...reveal()}><div><h2 id="faq-title">Sebelum kamu mulai.</h2><p>Informasi singkat tentang katalog dan layanan kami.</p><TextLink href="/bantuan">Lihat semua pertanyaan</TextLink></div><FaqList items={faq}/></motion.section>
    <motion.section className="landing-closing" aria-labelledby="closing-title" {...reveal()}><div><h2 id="closing-title"><TextGenerateEffect as="span" words={landing?.config.closingTitle ?? "Mulai dari kebutuhanmu."} duration={.3}/></h2><p>{landing?.config.closingBody ?? "Temukan layanan digital yang kamu butuhkan."}</p></div><div><Button asChild><Link href="/katalog">Buka katalog<ArrowRight size={18}/></Link></Button><Link href="/bantuan" className="landing-closing-help">Ada pertanyaan? Kunjungi bantuan</Link></div></motion.section>
  </main>;
}

