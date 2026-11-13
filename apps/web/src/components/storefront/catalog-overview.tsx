"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { categoryInfo, services } from "@/lib/storefront";
import { categorySlugs } from "@/lib/catalog";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { ServiceIllustration } from "./service-illustration";

const MotionLink = motion.create(Link);
export function CatalogOverview() {
 const reduce=useReducedMotion();
 return <section className="landing-services catalog-overview" aria-labelledby="catalog-services-title">
  <div className="section-heading"><div><h2 id="catalog-services-title">Cari yang kamu perlukan.</h2><p>Lima kategori yang mencakup kebutuhan digital sehari-hari.</p></div></div>
  <div className="service-categories">{categoryInfo.map(({name,detail,icon:Icon},index)=>{
   const items=services.filter(item=>item.category===name);
   return <MotionLink key={name} href={`/katalog/${categorySlugs[name]}`} className={`service-category service-category-${index+1}`} initial={reduce ? false : {opacity:0,y:10}} animate={{opacity:1,y:0}} whileHover={reduce ? undefined : {y:-3}} whileTap={reduce ? undefined : {scale:.99}} transition={{duration:reduce ? 0 : .26,delay:reduce ? 0 : index*.035}}>
    <span className="service-category-art"><ServiceIllustration categoryName={name}/></span>
    <span className="service-category-top"><span className="service-category-icon"><Icon size={23}/></span><span className="service-category-count">{items.length} layanan</span></span>
    <TextGenerateEffect as="span" words={name} className="service-category-title" duration={.22}/>
    <span className="service-category-detail">{detail}</span>
    <span className="service-category-items">{items.map(item=><span key={item.name}>{item.name}</span>)}</span>
    <span className="service-category-link">Lihat kategori<ArrowUpRight size={17}/></span>
   </MotionLink>;
  })}</div>
 </section>;
}
