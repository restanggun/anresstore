"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@anres/ui";
import { ArrowRight, ArrowUpRight, BookOpenCheck, Search, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Input } from "@/components/ui/input";
import { useReveal } from "@/components/ui/use-reveal";
import { categoryInfo, services } from "@/lib/storefront";
import { ServiceIllustration } from "./service-illustration";
import { FaqList } from "./faq-list";
import { TextLink } from "./text-link";

const categoryCards = categoryInfo.map(category => ({...category, items: services.filter(service => service.category === category.name)}));
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
const MotionLink = motion.create(Link);

export function HomeContent() {
  const [active, setActive] = useState<string>(categoryInfo[0].name);
  const current = categoryInfo.find(category => category.name === active) ?? categoryInfo[0];
  const reduce = useReducedMotion();
  const reveal = useReveal();
  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => setActive(value => {
      const index = categoryInfo.findIndex(category => category.name === value);
      return categoryInfo[(index + 1) % categoryInfo.length]!.name;
    }), 5200);
    return () => window.clearInterval(timer);
  }, [reduce]);
  return <main id="main" className="container landing-page">
    <section className="hero landing-hero landing-hero-switch" aria-labelledby="hero-title">
      <motion.div className="landing-hero-copy" {...reveal()}>
        <h1 id="hero-title"><TextGenerateEffect as="span" words="Satu tempat," className="landing-headline-line" duration={.34}/><TextGenerateEffect as="span" words="banyak kebutuhan." className="landing-headline-line" duration={.34} delay={.12}/></h1>
        <p>Temukan pilihan untuk bermain, berkarya, terhubung, dan memenuhi kebutuhan digital harian.</p>
        <div className="landing-hero-actions"><Button asChild><Link href={categoryUrl(current.name)}>Jelajahi {current.name}<ArrowRight size={18}/></Link></Button><Link href="/about" className="landing-secondary">Kenali Anres</Link></div>
      </motion.div>
      <AnimatePresence mode="wait"><motion.div key={current.name} className={`landing-hero-art landing-hero-art-${current.art}`} role="tabpanel" aria-label={current.name} initial={{opacity:0,y:12,filter:"blur(8px)"}} animate={{opacity:1,y:0,filter:"blur(0px)"}} exit={reduce?{opacity:0}:{opacity:0,y:-8,filter:"blur(6px)"}} transition={{duration:reduce?0:.34,ease:[.22,1,.36,1]}}><span className="landing-art-kicker">{current.detail}</span><div className="landing-art-visual"><ServiceIllustration categoryName={current.name} featured/></div><div className="landing-art-caption"><TextGenerateEffect as="h2" words={current.title} duration={.25}/><p>{current.description}</p></div><Link href={categoryUrl(current.name)} className="landing-art-link">Lihat kategori<ArrowUpRight size={18}/></Link></motion.div></AnimatePresence>
    </section>

    <section className="landing-services" aria-labelledby="services-title"><motion.div className="section-heading" {...reveal()}><div><h2 id="services-title">Cari yang kamu perlukan.</h2><p>Lima kategori yang mencakup kebutuhan digital sehari-hari.</p></div><form className="landing-search" role="search" action="/katalog"><label className="sr-only" htmlFor="landing-search">Cari layanan</label><Search size={19}/><Input id="landing-search" name="q" type="search" placeholder="Cari game atau layanan"/><Button type="submit" aria-label="Cari layanan"><ArrowRight size={18}/></Button></form></motion.div>
    <div className="service-categories">{categoryCards.map(({name,detail,icon:Icon,items},index)=><MotionLink key={name} href={categoryUrl(name)} className={`service-category service-category-${index+1}`} initial={{opacity:0,y:18,filter:"blur(7px)"}} whileInView={{opacity:1,y:0,filter:"blur(0px)"}} viewport={{once:true,amount:.18}} whileHover={reduce?undefined:{y:-4}} whileTap={reduce?undefined:{scale:.99}} transition={{duration:reduce?0:.38,delay:reduce?0:index*.065,ease:[.22,1,.36,1]}}><span className="service-category-art"><ServiceIllustration categoryName={name}/></span><span className="service-category-top"><span className="service-category-icon"><Icon size={23}/></span><span className="service-category-count">{items.length} layanan</span></span><TextGenerateEffect as="span" words={name} className="service-category-title" duration={.22} delay={index*.025}/><span className="service-category-detail">{detail}</span><span className="service-category-items">{items.map(item=><span key={item.name}>{item.name}</span>)}</span><span className="service-category-link">Lihat kategori<ArrowUpRight size={17}/></span></MotionLink>)}</div></section>
    <section className="landing-guide" aria-labelledby="guide-title"><motion.div className="guide-intro" {...reveal()}><div className="guide-brand" aria-hidden="true"><img src="/logo.svg" alt="" width="37" height="44"/></div><h2 id="guide-title">Kenali layanannya.<br/>Pilih dengan tenang.</h2><p>Kebutuhan digital tidak selalu sama. Mulai dari informasi yang jelas untuk menemukan pilihan yang tepat.</p><TextLink href="/about">Tentang Anres Store</TextLink></motion.div><ol className="guide-steps">{guide.map(({icon:Icon,title,description,href,action},index)=><motion.li key={title} {...reveal(index*.08)}><span className="guide-step-icon"><Icon size={22}/></span><div><h3>{title}</h3><p>{description}</p><Link href={href}>{action}<ArrowUpRight size={15}/></Link></div></motion.li>)}</ol></section>
    <motion.section className="landing-faq" aria-labelledby="faq-title" {...reveal()}><div><h2 id="faq-title">Sebelum kamu mulai.</h2><p>Informasi singkat tentang katalog dan layanan kami.</p><TextLink href="/bantuan">Lihat semua pertanyaan</TextLink></div><FaqList items={faq}/></motion.section>
    <motion.section className="landing-closing" aria-labelledby="closing-title" {...reveal()}><div><h2 id="closing-title"><TextGenerateEffect as="span" words="Mulai dari kebutuhanmu." duration={.3}/></h2><p>Temukan layanan digital yang kamu butuhkan.</p></div><div><Button asChild><Link href="/katalog">Buka katalog<ArrowRight size={18}/></Link></Button><Link href="/bantuan" className="landing-closing-help">Ada pertanyaan? Kunjungi bantuan</Link></div></motion.section>
  </main>;
}

