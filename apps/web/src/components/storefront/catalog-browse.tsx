"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "@/components/storefront/domain-link";
import { categoryInfo } from "@/lib/storefront";
import { isPromotionActive, slugify, tidyVariants, type CatalogKind, type CatalogProduct, type CatalogItem } from "@/lib/catalog";
import { CatalogCategoryTabs } from "./catalog-category-tabs";
import { CatalogProductCard } from "./catalog-product-card";
import { FlashSale } from "./flash-sale";
import { searchProducts } from "@/lib/product-search";

export function CatalogBrowse({offers,products,initialCategory,query,state,retry,onSelect,now}: {offers:(CatalogItem & {category:CatalogKind})[];products:CatalogProduct[];initialCategory:string;query:string;state:"loading"|"ready"|"error";retry:()=>void;onSelect:(name:string,category:CatalogKind,code?:string,slug?:string)=>void;now:number}) {
 const reduce=useReducedMotion();const [category,setCategory]=useState(initialCategory);const [limit,setLimit]=useState(20);
 const categories=["Semua",...categoryInfo.map(item=>item.name)];
 const visible=searchProducts(products.filter(item=>category==="Semua" || item.category===category), query, item=>[item.name,item.category,item.developer || ""]);
 if (!query.trim()) visible.sort((a,b)=>(a.pinRank ?? Infinity)-(b.pinRank ?? Infinity));
 const uniqueOffers = (items: (CatalogItem & {category:CatalogKind})[]) => [...new Set(items.map(item => `${item.category}:${item.product}`))].flatMap(key => { const group = items.filter(item => `${item.category}:${item.product}` === key); return tidyVariants(group).map(item => ({ ...item, category: group[0]!.category })); });
 const activeOffers = uniqueOffers(offers.filter(item => isPromotionActive(item.promotion,now) && (initialCategory === "Semua" || item.category === initialCategory)));
 const flashOffers = activeOffers;
 return <>
  {!query.trim() && <FlashSale offers={flashOffers} state={state} now={now} onSelect={onSelect}/>}
  <section id="catalog-results" className="catalog-directory" aria-labelledby="directory-title" tabIndex={-1}>
   <div className="catalog-directory-heading"><div>{initialCategory !== "Semua" && <Link href="/katalog" className="shop-text-button catalog-all-categories">Semua kategori</Link>}<h2 id="directory-title">{query.trim() ? "Hasil pencarian" : initialCategory === "Semua" ? "Pilih produk" : initialCategory === "Top up game" ? "Pilih game" : initialCategory === "PPOB" ? "Pilih kebutuhanmu" : initialCategory === "Aplikasi premium" ? "Pilih aplikasi" : initialCategory === "Booster media sosial" ? "Pilih media sosial" : "Pilih paket tugas"}</h2><p>{query.trim() ? `Pilihan untuk “${query.trim()}”.` : "Dari kebutuhan main sampai kebutuhan sehari-hari."}</p></div><span className="catalog-result-count" role="status">{state==="loading" ? "Memuat..." : `${visible.length} produk`}</span></div>
   {initialCategory === "Semua" && <CatalogCategoryTabs values={categories} value={category} onChange={value=>{setCategory(value);setLimit(16);}} label="Kategori produk" id="product-categories"/>}
   {state==="error" && <div className="catalog-load-error" role="alert">Sebagian produk belum dapat dimuat.<button className="shop-text-button" onClick={retry}>Coba lagi</button></div>}
   <AnimatePresence mode="wait" initial={false}><motion.div key={category} id="product-categories-panel" role={initialCategory === "Semua" ? "tabpanel" : undefined} aria-labelledby={initialCategory === "Semua" ? `product-categories-tab-${slugify(category)}` : "directory-title"} className="catalog-directory-panel" initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,y:-5}} transition={{duration:reduce ? 0 : .2}}>
    <div className="shop-products">{visible.slice(0,limit).map((item,index)=><CatalogProductCard key={item.category+item.slug} name={item.name} category={item.category} developer={item.developer} pinned={item.pinRank != null} ratingCount={item.ratingCount ?? 0} averageRating={item.averageRating ?? 0} index={index} onSelect={()=>onSelect(item.name,item.category,isPromotionActive(item.promotion,now) ? item.offerCode || undefined : undefined,item.slug)}/>)}</div>
    {state==="loading" && !visible.length && <div className="catalog-grid-skeleton" aria-hidden="true">{Array.from({length:4},(_,i)=><span key={i}/>)}</div>}
    {state!=="loading" && !visible.length && <div className="shop-empty"><h3>Belum ada pilihan yang cocok.</h3><p>Coba kata lain atau pilih kategori lainnya.</p></div>}
    {visible.length>limit && <button className="catalog-more" onClick={()=>setLimit(value=>value+16)}>Jelajahi lebih banyak<ArrowRight size={16}/></button>}
   </motion.div></AnimatePresence>
  </section>
 </>;
}
