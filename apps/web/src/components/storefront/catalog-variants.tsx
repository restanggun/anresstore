"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { tidyVariants, variantHint, currentPrice, isPromotionActive, money, slugify, type CatalogItem } from "@/lib/catalog";
import { CatalogCategoryTabs } from "./catalog-category-tabs";
import { SaleCountdown } from "./sale-countdown";

export function CatalogVariants({items,selected,onSelect,state,onRetry,now}: {items:CatalogItem[];selected:string;onSelect:(code:string)=>void;state:"loading"|"ready"|"error";onRetry:()=>void;now:number}) {
 const reduce = useReducedMotion();
 const variants = tidyVariants(items);
 const priority = ["Diamond","UC","Crystal","Points","Top up","Membership","Bulanan","Tahunan","Harian & mingguan","Paket lainnya","Pilihan lainnya"];
 const sections = [...new Set(variants.map(item=>item.section))].sort((a,b)=>{
  const ai=priority.indexOf(a),bi=priority.indexOf(b);
  return (ai<0 ? 100 : ai)-(bi<0 ? 100 : bi) || a.localeCompare(b,"id");
 });
 const [tab,setTab]=useState("");const [query,setQuery]=useState("");const [limit,setLimit]=useState(12);
 const chosen = items.find(item=>item.code===selected);
 const active = sections.includes(tab) ? tab : chosen?.section || sections[0] || "";
 const matches = variants.filter(item=>item.section===active && `${item.displayName} ${item.brand}`.toLowerCase().includes(query.trim().toLowerCase()));
 if(state === "loading") return <div className="variant-loading" role="status"><span/>Memuat pilihan untukmu...</div>;
 if(state === "error") return <div className="shop-empty" role="alert"><h3>Pilihan belum dapat dimuat.</h3><p>Periksa koneksi, lalu coba kembali.</p><button className="shop-text-button" onClick={onRetry}>Coba lagi</button></div>;
 if(!variants.length) return <div className="shop-empty"><h3>Belum tersedia.</h3><p>Silakan pilih produk lainnya.</p></div>;
 return <section className="catalog-variants" aria-labelledby="variant-heading">
  <div className="variant-heading"><div><h3 id="variant-heading">Pilih kebutuhanmu</h3><p>Temukan nominal atau paket yang pas.</p></div></div>
  <CatalogCategoryTabs values={sections} value={active} onChange={value=>{setTab(value);setQuery("");setLimit(12);onSelect("");}} label="Kategori nominal" id="variant-categories"/>
  <div className="variant-search"><Search size={17} aria-hidden="true"/><Input type="search" aria-label="Cari nominal" placeholder="Cari nominal atau paket" value={query} onChange={event=>{setQuery(event.target.value);setLimit(12);}}/></div>
  <AnimatePresence mode="wait" initial={false}><motion.div key={active} id="variant-categories-panel" role="tabpanel" aria-labelledby={`variant-categories-tab-${slugify(active)}`} className="variant-panel" initial={reduce ? false : {opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,y:-4}} transition={{duration:reduce ? 0 : .18}}>
   <div className="variant-grid" role="group" aria-label={active}>{matches.slice(0,limit).map(item=>{
    const checked = selected===item.code, sale=isPromotionActive(item.promotion,now);
    return <motion.button type="button" key={item.code} className={`variant-card${checked ? " is-selected" : ""}`} aria-pressed={checked} onClick={()=>onSelect(item.code)} whileTap={reduce ? undefined : {scale:.98}} transition={{duration:.16}}>
      <span className="variant-card-top"><span className="variant-identity"><strong>{item.displayName}</strong>{variantHint(item) && <small>{variantHint(item)}</small>}</span><span className="variant-check" aria-hidden="true">{checked && <motion.span initial={reduce ? false : {scale:.4,opacity:0}} animate={{scale:1,opacity:1}}><Check size={14} strokeWidth={3}/></motion.span>}</span></span>
      <span className="variant-price">{sale && <del>{money(item.promotion!.originalPrice)}</del>}<b>{money(currentPrice(item,now))}</b>{sale && <span className="variant-sale-label">Flash sale</span>}</span>
    </motion.button>;
   })}</div>
   {!matches.length && <p className="variant-empty">Tidak ada pilihan yang cocok. Coba nominal lain.</p>}
   {matches.length>limit && <button type="button" className="variant-more" onClick={()=>setLimit(value=>value+12)}>Lihat pilihan lainnya<ChevronDown size={16}/></button>}
  </motion.div></AnimatePresence>
  {chosen && <motion.div className="variant-chosen" initial={reduce ? false : {opacity:0}} animate={{opacity:1}}><Check size={17}/><span><strong>{chosen.displayName}</strong> dipilih</span>{isPromotionActive(chosen.promotion,now) && <SaleCountdown promotion={chosen.promotion!} now={now} compact/>}</motion.div>}
  {chosen?.description && <details className="variant-terms"><summary>Ketentuan produk<ChevronDown size={15}/></summary><p>{chosen.description}</p></details>}
 </section>;
}
