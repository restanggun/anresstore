"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Search, ShoppingCart } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { useReveal } from "@/components/ui/use-reveal";
import { gameArtwork, gameCoverArtwork, gameDevelopers } from "./catalog-product-card";
import { PaymentCheckout } from "./payment-checkout";
import { initCart, readCart, writeCart } from "@/lib/cart";
import { createOrder } from "@/lib/orders";
import { apiUrl } from "@/lib/auth-api";
import "./catalog-flow.css";
import "./catalog-system.css";
import "./catalog-refresh.css";
import { CatalogOverview } from "./catalog-overview";
import { CatalogBrowse } from "./catalog-browse";
import { CatalogVariants } from "./catalog-variants";
import { SaleCountdown } from "./sale-countdown";
import { currentPrice, isPromotionActive, type CatalogItem, type CatalogProduct, type CatalogFeed } from "@/lib/catalog";

type Kind = "Top up game" | "PPOB" | "Booster media sosial" | "Aplikasi premium" | "Format tugas";
type LiveProduct = CatalogItem;
const choices: Record<Kind, string[]> = { "Top up game": ["Mobile Legends", "Free Fire", "Roblox", "PUBG Mobile", "Genshin Impact", "Valorant"], "PPOB": ["Pulsa", "Paket data", "Token listrik", "E-wallet"], "Booster media sosial": ["Instagram", "TikTok", "YouTube", "Facebook"], "Aplikasi premium": ["ChatGPT", "Claude", "Netflix", "Disney+", "Canva", "Spotify"], "Format tugas": ["Artikel", "Makalah", "Tesis", "Skripsi", "Esai", "Laporan"] };
export const categorySlugs: Record<Kind, string> = { "Top up game": "top-up-game", "PPOB": "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Format tugas": "format-tugas" };
export const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
export function Catalog({ initialCategory = "Semua", initialQuery = "", initialProduct = "", initialProductSlug = "", initialVariant = "" }: { initialCategory?: string; initialQuery?: string; initialProduct?: string; initialProductSlug?: string; initialVariant?: string }) {
 const router = useRouter(); const reduce = useReducedMotion(); const reveal = useReveal();
 const [kind] = useState<Kind | null>(initialCategory in choices ? initialCategory as Kind : null);
 const [product, setProduct] = useState(initialProduct); const [query, setQuery] = useState(initialQuery); const [step, setStep] = useState(initialProduct || initialProductSlug ? 1 : 0);
 const progressRef = useRef<HTMLElement>(null); const previousStep = useRef(step);
 const orderId = useRef<{id:string;itemId:string;payload:string} | null>(null); const [orderBusy,setOrderBusy]=useState(false); const [orderError,setOrderError]=useState("");
 const [variant, setVariant] = useState(""); const [target, setTarget] = useState(""); const [contact, setContact] = useState(""); const [payment, setPayment] = useState("QRIS");
 const [catalogItems, setCatalogItems] = useState<LiveProduct[]>([]); const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
 const [reload, setReload] = useState(0);
 const [searchProducts, setSearchProducts] = useState<CatalogProduct[]>([]);
 const [searchState, setSearchState] = useState<"loading" | "ready" | "error">("loading");
 const [now,setNow] = useState(0); const clockOffset = useRef(0);
 useEffect(() => { const tick=()=>setNow(Date.now()+clockOffset.current); tick(); const timer=window.setInterval(tick,1000); return()=>window.clearInterval(timer); },[]);
 const liveKind = kind === "Top up game" || kind === "PPOB" || kind === "Aplikasi premium";
 useEffect(() => {
  if (step > 0) return;
  const controller = new AbortController();
  const sources = [["game", "Top up game"], ["prepaid", "PPOB"], ["apps", "Aplikasi premium"]] as const;
  setSearchState("loading");
  Promise.allSettled(sources.map(async ([source, category]) => {
   const response = await fetch(`${apiUrl}/catalog/${source}`, {signal: controller.signal});
   if (!response.ok) throw new Error();
   const data = await response.json() as CatalogFeed;
   if (!Array.isArray(data.products) || data.products.some(item => typeof item.name !== "string")) throw new Error();
   if (Number.isFinite(Date.parse(data.serverTime))) clockOffset.current=Date.parse(data.serverTime)-Date.now();
   return data.products.map(item => ({...item, category}));
  })).then(results => {
   if (controller.signal.aborted) return;
   setSearchProducts(results.flatMap(result => result.status === "fulfilled" ? result.value : []));
   setSearchState(results.some(result => result.status === "rejected") ? "error" : "ready");
  });
  return () => controller.abort();
 }, [kind, reload, step]);
 useEffect(() => {
  if (!liveKind || step === 0) return;
  const controller = new AbortController(); setCatalogState("loading"); setVariant(""); setCatalogItems([]);
  fetch(`${apiUrl}/catalog/${kind === "Top up game" ? "game" : kind === "PPOB" ? "prepaid" : "apps"}`, { signal: controller.signal })
   .then(response => { if (!response.ok) throw new Error(); return response.json(); })
   .then((data: CatalogFeed) => {
    if (controller.signal.aborted) return;
    if (!Array.isArray(data.items) || data.items.some(item => typeof item.code !== "string" || typeof item.product !== "string" || typeof item.productSlug !== "string" || !Number.isSafeInteger(item.price) || item.price <= 0)) throw new Error();
    if (Number.isFinite(Date.parse(data.serverTime))) {clockOffset.current=Date.parse(data.serverTime)-Date.now();setNow(Date.now()+clockOffset.current);}
    setCatalogItems(data.items);
    const resolvedProduct = initialProductSlug ? data.items.find(item=>item.productSlug===initialProductSlug)?.product : initialProduct;
    if(initialVariant && data.items.some(item=>item.code===initialVariant && item.product===resolvedProduct)) setVariant(initialVariant);
    if (initialProductSlug) setProduct(data.items.find(item => item.productSlug === initialProductSlug)?.product ?? initialProduct);
    setCatalogState("ready");
   })
   .catch(() => { if (!controller.signal.aborted) setCatalogState("error"); });
  return () => controller.abort();
 }, [kind, initialProduct, initialProductSlug, initialVariant, liveKind, reload]);
 const productItems = catalogItems.filter(item => item.product === product);
 const [pages, setPages] = useState(5); const [days, setDays] = useState(7); const [revisions, setRevisions] = useState(1); const [theme, setTheme] = useState(""); const [service, setService] = useState("Followers");
 useEffect(() => { if (step !== previousStep.current && step > 0) progressRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); previousStep.current = step; }, [step, reduce]);
 const selectedLive = productItems.find(item => item.code === variant);
 const price = liveKind ? selectedLive ? currentPrice(selectedLive,now) : 0 : kind === "Format tugas" ? Math.round((pages * 5000 + revisions * 10000) * (days <= 2 ? 1.5 : 1)) : variant.includes("100") ? 25000 : 15000;
 const orderDetails = liveKind ? selectedLive ? `${selectedLive.name} · ${selectedLive.group} · ${selectedLive.code}` : "" : kind === "Format tugas" ? `${theme}, ${pages} halaman, ${days} hari, ${revisions} revisi` : kind === "Booster media sosial" ? `${service}, ${variant}` : variant;
 const saveOrder = async () => { if(!kind || orderBusy || (liveKind && (!selectedLive || catalogState !== "ready"))) return; setOrderBusy(true); setOrderError(""); const payload=JSON.stringify({payment,product,kind,orderDetails,target,contact,price}); if(!orderId.current || orderId.current.payload !== payload) orderId.current={id:crypto.randomUUID(),itemId:crypto.randomUUID(),payload}; const {id,itemId}=orderId.current; try { await createOrder(id,payment,[{id:itemId,product,category:kind,details:orderDetails,target,contact,price,quantity:1}]); router.push(`/invoice/${id}`); } catch(error) { setOrderError(error instanceof Error ? error.message : "Pesanan belum dapat disimpan."); setOrderBusy(false); } };
 const start = (value: string, category: Kind = kind!, code?: string) => { router.push(`/katalog/${categorySlugs[category]}/${slugify(value)}${code ? `?pilihan=${encodeURIComponent(code)}` : ""}`); };
 const reset = () => { if (kind) router.push(`/katalog/${categorySlugs[kind]}`); else router.push("/katalog"); };
 const categoryName = (name: string) => name;
 const browseProducts = [...searchProducts, ...(Object.entries(choices) as [Kind,string[]][]).filter(([category])=>category === "Format tugas" || category === "Booster media sosial").flatMap(([category,names])=>names.map(name=>({name,slug:slugify(name),category,count:0,minPrice:0,promotion:null})))];
 return <div className="shop-flow">
  <motion.div className={`shop-heading${step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] ? " shop-heading-game" : ""}`} {...reveal()}><div className="shop-heading-copy"><span className="shop-kicker">Katalog Anres</span>{step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] ? <><div className="shop-heading-game-title"><span className="shop-heading-game-icon"><img src={gameArtwork[product]} alt=""/></span><span><h1><TextGenerateEffect as="span" words={product} duration={.3}/></h1><small>{gameDevelopers[product]}</small></span></div><p>Lengkapi pesananmu dengan mudah.</p></> : <><h1><TextGenerateEffect key={`${step}:${kind}:${product}`} as="span" words={step ? product || (catalogState === "ready" ? "Produk tidak tersedia" : "Memuat produk...") : kind || "Semua kebutuhan digitalmu."} duration={.3}/></h1><p>{step ? "Lengkapi pesananmu dengan mudah." : "Pilih layanan, temukan produk, dan lanjutkan harimu."}</p></>}</div>{step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] && <span className="shop-heading-game-art" aria-hidden="true"><img src={gameCoverArtwork[product]} alt=""/></span>}{step > 0 ? <button className="shop-back" onClick={() => step === 1 ? reset() : setStep(step - 1)}><ArrowLeft size={16}/>Kembali</button> : <form className="shop-search shop-hero-search" role="search" onSubmit={event=>event.preventDefault()}><Search size={19} aria-hidden="true"/><Input aria-label="Cari produk" type="search" placeholder="Cari game atau layanan" value={query} onChange={event=>setQuery(event.target.value)}/><button type="submit" aria-label="Cari"><ArrowRight size={18}/></button></form>}</motion.div>
  {step === 0 && !kind && !query.trim() && <CatalogOverview/>}
  {step === 0 && <CatalogBrowse products={browseProducts} initialCategory={kind || "Semua"} query={query} state={searchState} retry={()=>setReload(value=>value+1)} onSelect={(name,category,code)=>start(name,category,code)} now={now}/>}
  {step > 0 && kind && <div className="order-layout"><div className="order-main"><nav ref={progressRef} className="order-progress" aria-label="Tahap pesanan">{["Detail pesanan", "Checkout", "Pembayaran"].map((label, i) => <span key={label} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}><b>{i + 1}</b>{label}</span>)}</nav>
  <motion.div key={step} initial={{opacity:0,y:12,filter:"blur(5px)"}} animate={{opacity:1,y:0,filter:"blur(0px)"}} transition={{duration:reduce?0:.3}}>{step === 1 && <div className="order-card"><h2><TextGenerateEffect as="span" words="Detail pesanan" duration={.22}/></h2><p>Isi informasi berikut untuk {product}.</p>
   {kind === "Booster media sosial" && <><label>Layanan<select value={service} onChange={e => setService(e.target.value)}><option>Followers</option><option>Likes</option><option>Views</option><option>Comments</option></select></label><label>Jenis layanan<select value={variant} onChange={e => setVariant(e.target.value)}><option value="">Pilih jenis layanan</option><option>100 {service}</option><option>500 {service}</option><option>1000 {service}</option></select></label><label>Link akun atau konten<Input value={target} onChange={e => setTarget(e.target.value)} placeholder="https://..."/></label></>}

   {kind === "Format tugas" && <><label>Tema atau topik<Input value={theme} onChange={e => setTheme(e.target.value)} placeholder="Ceritakan topik dokumen"/></label><label>Kebutuhan pengerjaan<textarea value={target} onChange={e => setTarget(e.target.value)} placeholder="Jelaskan format dan kebutuhan dokumen"/></label><div className="order-fields"><label>Jumlah halaman<Input type="number" min="1" value={pages} onChange={e => setPages(Math.max(1, Number(e.target.value)))}/></label><label>Jumlah revisi<Input type="number" min="0" value={revisions} onChange={e => setRevisions(Math.max(0, Number(e.target.value)))}/></label></div><label>Deadline: {days} hari<input type="range" min="1" max="30" value={days} onChange={e => setDays(Number(e.target.value))}/></label><p>Estimasi: {money(5000)} per halaman + {money(10000)} per revisi{days <= 2 ? ", termasuk biaya pengerjaan cepat 50%." : "."}</p></>}
   {liveKind && <><label>{kind === "Top up game" ? "ID pemain / ID server" : kind === "Aplikasi premium" ? "Email / tujuan layanan" : "Nomor tujuan / ID pelanggan"}<Input value={target} onChange={e => setTarget(e.target.value)} placeholder={kind === "Top up game" ? "Masukkan ID pemain dan server" : kind === "Aplikasi premium" ? "Ikuti keterangan layanan, jangan masukkan kata sandi" : "Masukkan nomor tujuan"}/></label><CatalogVariants items={productItems} selected={variant} onSelect={setVariant} state={catalogState} onRetry={()=>setReload(value=>value+1)} now={now}/></>}
   <label>Nomor WhatsApp atau email<Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Untuk informasi pesanan"/></label><Button variant="outline" className="order-cart-add" disabled={!target.trim() || !contact.trim() || (liveKind ? catalogState !== "ready" || !selectedLive : kind === "Format tugas" ? !theme.trim() : !variant)} onClick={async () => { try { await initCart(); const details = orderDetails; const items = readCart(); items.push({ id: crypto.randomUUID(), product, category: kind, details, target, contact, price, quantity: 1 }); await writeCart(items); window.dispatchEvent(new Event("anres-cart-open")); } catch (error) { window.alert(error instanceof Error ? error.message : "Keranjang tidak dapat disimpan. Coba lagi."); } }}><ShoppingCart size={17}/>Tambah ke keranjang</Button><Button className="order-primary" disabled={!target.trim() || !contact.trim() || (liveKind ? catalogState !== "ready" || !selectedLive : kind === "Format tugas" ? !theme.trim() : !variant)} onClick={() => setStep(2)}>Lanjut ke checkout<ArrowRight size={17}/></Button></div>}
  {step === 2 && <div className="order-card"><h2><TextGenerateEffect as="span" words="Periksa pesanan" duration={.22}/></h2><p>Pastikan detailnya sudah benar sebelum memilih pembayaran.</p><dl><div><dt>Produk</dt><dd>{product}</dd></div><div><dt>Pilihan</dt><dd>{selectedLive?.displayName || orderDetails}</dd></div><div><dt>Tujuan / detail</dt><dd>{target}</dd></div><div><dt>Kontak</dt><dd>{contact}</dd></div></dl><Button className="order-primary" onClick={() => setStep(3)}>Pilih pembayaran<ArrowRight size={17}/></Button></div>}
  {step === 3 && liveKind && selectedLive ? <div className="order-card"><h2>Pilih pembayaran</h2><PaymentCheckout source={kind === "Top up game" ? "game" : kind === "PPOB" ? "prepaid" : "apps"} code={selectedLive.code} target={target} amount={price} contact={contact}/></div> : step === 3 && <div className="order-card"><h2><TextGenerateEffect as="span" words="Pilih pembayaran" duration={.22}/></h2><p>Pilih metode pembayaran. Pembayaran belum diproses saat pesanan disimpan.</p><div className="order-options">{["QRIS", "Transfer bank", "E-wallet"].map(x => <button type="button" key={x} aria-pressed={payment === x} disabled={orderBusy} onClick={() => { setPayment(x); orderId.current=null; }}><strong>{x}</strong>{payment === x && <Check size={18} aria-hidden="true"/>}</button>)}</div>{orderError && <p role="alert">{orderError}</p>}<Button className="order-primary" disabled={orderBusy} onClick={saveOrder}>{orderBusy ? "Menyimpan..." : "Simpan pesanan"}<ArrowRight size={17}/></Button></div>}</motion.div></div><motion.aside className="order-summary" {...reveal(.08)}><span>Ringkasan pesanan</span><h3>{product}</h3><p>{categoryName(kind)}</p><hr/><div><span>Total</span><strong>{money(price)}</strong></div>{selectedLive && isPromotionActive(selectedLive.promotion,now) && <div className="summary-sale"><span>Harga flash sale</span><SaleCountdown promotion={selectedLive.promotion!} now={now} compact/></div>}<small>Periksa kembali pilihan dan tujuan sebelum melanjutkan.</small></motion.aside></div>}
 </div>;
}



