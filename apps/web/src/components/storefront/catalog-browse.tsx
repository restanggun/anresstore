"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import { categoryInfo } from "@/lib/storefront";
import { isPromotionActive, slugify, type CatalogKind, type CatalogProduct } from "@/lib/catalog";
import { CatalogCategoryTabs } from "./catalog-category-tabs";
import { CatalogProductCard } from "./catalog-product-card";
import { SaleCountdown } from "./sale-countdown";

export function CatalogBrowse({products,initialCategory,query,state,retry,onSelect,now}: {products:CatalogProduct[];initialCategory:string;query:string;state:"loading"|"ready"|"error";retry:()=>void;onSelect:(name:string,category:CatalogKind,code?:string)=>void;now:number}) {
 const reduce=useReducedMotion();const [category,setCategory]=useState(initialCategory);const [limit,setLimit]=useState(20);
 const categories=["Semua",...categoryInfo.map(item=>item.name)];
 const overview=initialCategory === "Semua" && !query.trim();
 const visible=products.filter(item=>(category==="Semua" || item.category===category) && item.name.toLowerCase().includes(query.trim().toLowerCase()));
 const offers=products.filter(item=>isPromotionActive(item.promotion,now) && (initialCategory === "Semua" || item.category === initialCategory));
 const firstOffer=offers[0];
 return <>
  {!query.trim() && <section className="catalog-flash" aria-labelledby="flash-title">
   <div className="catalog-flash-heading"><div><span className="flash-tag"><Zap size={15} fill="currentColor" aria-hidden="true"/>Harga pilihan</span><h2 id="flash-title">Flash sale</h2><p>Pilihan hemat untuk kebutuhanmu.</p></div>{firstOffer?.promotion && <div className="flash-deadline"><SaleCountdown promotion={firstOffer.promotion} now={now}/><span>Harga kembali normal setelah promo berakhir.</span></div>}</div>
   {offers.length ? <div className="shop-products flash-products" data-count={offers.length}>{offers.map((item,index)=><CatalogProductCard key={item.category+item.slug} name={item.name} category={item.category} minPrice={item.minPrice} regularMinPrice={item.regularMinPrice} offerName={item.offerName} promotion={item.promotion} now={now} index={index} onSelect={()=>onSelect(item.name,item.category,isPromotionActive(item.promotion,now) ? item.offerCode || undefined : undefined)}/>)}</div> : <p className="flash-empty" role="status">{state==="loading" ? "Menyiapkan pilihan promo..." : "Belum ada promo aktif. Jelajahi pilihan di bawah ini."}</p>}
  </section>}
  {!overview && <section className="catalog-directory" aria-labelledby="directory-title">
   <div className="catalog-directory-heading"><div>{initialCategory !== "Semua" && <Link href="/katalog" className="shop-text-button catalog-all-categories">Semua kategori</Link>}<h2 id="directory-title">{query.trim() ? "Hasil pencarian" : initialCategory === "Top up game" ? "Pilih game" : initialCategory === "PPOB" ? "Pilih kebutuhanmu" : initialCategory === "Aplikasi premium" ? "Pilih aplikasi" : initialCategory === "Booster media sosial" ? "Pilih media sosial" : "Pilih jenis dokumen"}</h2><p>{query.trim() ? `Pilihan untuk “${query.trim()}”.` : "Dari kebutuhan main sampai kebutuhan sehari-hari."}</p></div><span className="catalog-result-count" role="status">{state==="loading" ? "Memuat..." : `${visible.length} produk`}</span></div>
   {initialCategory === "Semua" && <CatalogCategoryTabs values={categories} value={category} onChange={value=>{setCategory(value);setLimit(16);}} label="Kategori produk" id="product-categories"/>}
   {state==="error" && <div className="catalog-load-error" role="alert">Sebagian produk belum dapat dimuat.<button className="shop-text-button" onClick={retry}>Coba lagi</button></div>}
   <AnimatePresence mode="wait" initial={false}><motion.div key={category} id="product-categories-panel" role={initialCategory === "Semua" ? "tabpanel" : undefined} aria-labelledby={initialCategory === "Semua" ? `product-categories-tab-${slugify(category)}` : "directory-title"} className="catalog-directory-panel" initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,y:-5}} transition={{duration:reduce ? 0 : .2}}>
    <div className="shop-products">{visible.slice(0,limit).map((item,index)=><CatalogProductCard key={item.category+item.slug} name={item.name} category={item.category} minPrice={item.minPrice || undefined} regularMinPrice={item.regularMinPrice} offerName={item.offerName} promotion={item.promotion} now={now} index={index} onSelect={()=>onSelect(item.name,item.category,isPromotionActive(item.promotion,now) ? item.offerCode || undefined : undefined)}/>)}</div>
    {state==="loading" && !visible.length && <div className="catalog-grid-skeleton" aria-hidden="true">{Array.from({length:4},(_,i)=><span key={i}/>)}</div>}
    {state!=="loading" && !visible.length && <div className="shop-empty"><h3>Belum ada pilihan yang cocok.</h3><p>Coba kata lain atau pilih kategori lainnya.</p></div>}
    {visible.length>limit && <button className="catalog-more" onClick={()=>setLimit(value=>value+16)}>Jelajahi lebih banyak<ArrowRight size={16}/></button>}
   </motion.div></AnimatePresence>
  </section>}
 </>;
}
