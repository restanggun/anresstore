"use client";
import { SearchField } from "@anres/ui";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { tidyVariants, variantHint, variantRegion, currentPrice, isPromotionActive, money, slugify, type CatalogItem } from "@/lib/catalog";
import { CatalogCategoryTabs } from "./catalog-category-tabs";
import { FlashSaleInfo } from "./flash-sale-info";
import { searchProducts } from "@/lib/product-search";
import { gameItemArt } from "@/lib/game-item-art";
import { gameArtwork } from "./catalog-product-card";
import { ppobBrandArt } from "@/lib/ppob-art";

export function CatalogVariants({items,selected,onSelect,onSelected,state,onRetry,now}: {items:CatalogItem[];selected:string;onSelect:(code:string)=>void;onSelected?:()=>void;state:"loading"|"ready"|"error";onRetry:()=>void;now:number}) {
 const reduce = useReducedMotion();
 const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 useEffect(() => () => clearTimeout(scrollTimer.current), []);
 const variants = tidyVariants(items, selected);
 const [region,setRegion] = useState("Semua region");
 const regions = [...new Set(variants.map(variantRegion))];
 const showRegions = regions.length > 1 && regions.some(value => value !== "Tidak disebutkan");
 const regionVariants = showRegions && region !== "Semua region" ? variants.filter(item => variantRegion(item) === region) : variants;
 const taskServices = items.some(item => item.taskPricing);
 const priority = ["Per menit","Diamond","UC","Crystal","Points","Top up","Membership","Bulanan","Tahunan","Harian & mingguan","Paket lainnya","Pilihan lainnya"];
 const sections = [...new Set(regionVariants.map(item=>item.section))].sort((a,b)=>{
  const ai=priority.indexOf(a),bi=priority.indexOf(b);
  return (ai<0 ? 100 : ai)-(bi<0 ? 100 : bi) || a.localeCompare(b,"id");
 });
 const [tab,setTab]=useState("");const [query,setQuery]=useState("");const [limit,setLimit]=useState(12);
 const sectionImages = Object.fromEntries(sections.map(section => {
  const sectionItems = regionVariants.filter(item => item.section === section);
  const game = sectionItems[0]?.product;
  if (!game || !gameArtwork[game]) return [section, ppobBrandArt(section)];
  return [section, sectionItems.map(gameItemArt).find(Boolean) || gameArtwork[game]];
 }));
 const chosen = items.find(item=>item.code===selected);
 useEffect(() => { if (selected && chosen?.section) { setTab(chosen.section); setQuery(""); if (region !== "Semua region" && variantRegion(chosen) !== region) setRegion(variantRegion(chosen)); } }, [selected, chosen?.section]);
 const active = sections.includes(tab) ? tab : chosen?.section || sections[0] || "";
 const searching = Boolean(query.trim());
 const matches = searchProducts(searching ? regionVariants : regionVariants.filter(item=>item.section===active), query, item=>[item.displayName,item.brand,item.section,variantRegion(item)]);
 const shown = matches.slice(0,limit);
 if (chosen && matches.includes(chosen) && !shown.includes(chosen)) shown.push(chosen);
 if(state === "loading") return <div className="variant-loading" role="status"><span/>Memuat pilihan untukmu...</div>;
 if(state === "error") return <div className="shop-empty" role="alert"><h3>Pilihan belum dapat dimuat.</h3><p>Periksa koneksi, lalu coba kembali.</p><button className="shop-text-button" onClick={onRetry}>Coba lagi</button></div>;
 if(!variants.length) return <div className="shop-empty"><h3>Belum tersedia.</h3><p>Silakan pilih produk lainnya.</p></div>;
 return <section className="catalog-variants" aria-labelledby="variant-heading">
  <div className="variant-heading"><div><h3 id="variant-heading" tabIndex={-1}>{taskServices ? "Pilih layanan" : "Pilih kebutuhanmu"}</h3><p>{taskServices ? "Pilih paket sesuai pekerjaanmu." : "Temukan nominal atau paket yang pas."}</p></div></div>
  {showRegions && <div className="variant-regions" role="group" aria-label="Region produk">{["Semua region",...regions].map(value=><button type="button" key={value} aria-pressed={region===value} onClick={()=>{clearTimeout(scrollTimer.current);setRegion(value);setTab("");setQuery("");setLimit(12);onSelect("");}}>{value}</button>)}</div>}
  <CatalogCategoryTabs values={sections} value={active} onChange={value=>{clearTimeout(scrollTimer.current);setTab(value);setQuery("");setLimit(12);onSelect("");}} label={taskServices ? "Jenis layanan" : "Kategori nominal"} id="variant-categories" images={sectionImages}/>
  <SearchField className="variant-search" aria-label={taskServices ? "Cari paket tugas" : "Cari nominal"} placeholder={taskServices ? "Cari paket tugas" : "Cari nominal atau paket"} value={query} onChange={event=>{clearTimeout(scrollTimer.current);setQuery(event.target.value);setLimit(12);}}/>
  {searching && <p className="variant-search-count" role="status">{matches.length} pilihan ditemukan dalam region ini</p>}
  <AnimatePresence mode="wait" initial={false}><motion.div key={active} id="variant-categories-panel" role={searching ? "region" : "tabpanel"} aria-labelledby={searching ? "variant-heading" : `variant-categories-tab-${slugify(active)}`} className="variant-panel" initial={reduce ? false : {opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,y:-4}} transition={{duration:reduce ? 0 : .18}}>
   <div className="variant-grid" role="group" aria-label={searching ? "Hasil pencarian nominal" : active}>{shown.map(item=>{
    const checked = selected===item.code, sale=isPromotionActive(item.promotion,now), itemArt=gameItemArt(item), brandArt=ppobBrandArt(item.brand), art=itemArt || gameArtwork[item.product] || brandArt;
    return <motion.button type="button" key={item.code} className={`variant-card${checked ? " is-selected" : ""}`} aria-pressed={checked} onClick={()=>{clearTimeout(scrollTimer.current);setTab(item.section);onSelect(checked ? "" : item.code);if (!checked && onSelected) scrollTimer.current=setTimeout(onSelected,reduce ? 0 : 450);}} animate={reduce ? undefined : {scale:checked ? 1.025 : 1,rotate:checked ? -1 : 0}} whileTap={reduce ? undefined : {scale:.98}} transition={{duration:reduce ? 0 : .3}}>
      <span className="variant-card-top">{art && <img className={`variant-item-art${brandArt && art === brandArt ? " variant-brand-art" : itemArt ? "" : " variant-game-art"}`} src={art} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }}/>}<span className="variant-identity"><strong>{item.displayName}</strong>{variantHint(item) && <small>{variantHint(item)}</small>}{item.serviceQuantity && item.serviceQuantity > 1 ? <small>Paket {item.serviceQuantity.toLocaleString("id-ID")} unit</small> : null}</span><span className="variant-check" aria-hidden="true">{checked && <motion.span initial={reduce ? false : {scale:.4,opacity:0}} animate={{scale:1,opacity:1}}><Check size={14} strokeWidth={3}/></motion.span>}</span></span>
      <span className="variant-price">{item.taskPricing?.unit === "custom" ? <b>Minta penawaran</b> : item.taskPricing?.startingPrice !== undefined ? <b>Mulai {money(item.taskPricing.startingPrice)}</b> : sale ? <><FlashSaleInfo variant="price" promotion={item.promotion!} price={currentPrice(item,now)} now={now} showCountdown={false}/><FlashSaleInfo variant="badge" promotion={item.promotion!} now={now}/></> : <b>{money(currentPrice(item,now))}</b>}</span>
    </motion.button>;
   })}</div>
   {!matches.length && <p className="variant-empty">Tidak ada pilihan yang cocok. Coba nominal lain.</p>}
   {matches.length>limit && <button type="button" className="variant-more" onClick={()=>setLimit(value=>value+12)}>Lihat pilihan lainnya<ChevronDown size={16}/></button>}
   {limit>12 && <button type="button" className="variant-more" onClick={()=>setLimit(value=>Math.max(12,value-12))}>Tampilkan lebih sedikit<ChevronUp size={16}/></button>}
  </motion.div></AnimatePresence>
  {chosen && <motion.div className="variant-chosen" initial={reduce ? false : {opacity:0}} animate={{opacity:1}}><Check size={17}/><span><strong>{chosen.displayName}</strong> dipilih</span>{isPromotionActive(chosen.promotion,now) && <FlashSaleInfo variant="compact" promotion={chosen.promotion!} now={now}/>}</motion.div>}
  {chosen?.description && <details className="variant-terms"><summary>Ketentuan produk<ChevronDown size={15}/></summary><p>{chosen.description}</p></details>}
 </section>;
}
