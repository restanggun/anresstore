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
import { PremiumCheckout } from "./premium-checkout";
import { initCart, readCart, writeCart } from "@/lib/cart";
import { useCheckoutEmail } from "./use-checkout-email";
import { apiUrl } from "@/lib/auth-api";
import "./catalog-flow.css";
import "./catalog-system.css";
import "./catalog-refresh.css";
import { CatalogOverview } from "./catalog-overview";
import { CatalogBrowse } from "./catalog-browse";
import { CatalogVariants } from "./catalog-variants";
import { CheckoutVoucher } from "./checkout-voucher";
import { FlashSaleInfo } from "./flash-sale-info";
import { FlashSale } from "./flash-sale";
import { currentPrice, isPromotionActive, tidyVariants, type CatalogItem, type CatalogProduct, type CatalogFeed } from "@/lib/catalog";

type Kind = "Top up game" | "PPOB" | "Booster media sosial" | "Aplikasi premium" | "Joki tugas";
type LiveProduct = CatalogItem;
const choices: Record<Kind, string[]> = { "Top up game": ["Mobile Legends", "Free Fire", "Roblox", "PUBG Mobile", "Genshin Impact", "Valorant"], "PPOB": ["Pulsa", "Paket data", "Token listrik", "E-wallet"], "Booster media sosial": ["Instagram", "TikTok", "YouTube", "Facebook"], "Aplikasi premium": ["ChatGPT", "Claude", "Netflix", "Disney+", "Canva", "Spotify"], "Joki tugas": ["Artikel", "Makalah", "Tesis", "Skripsi", "Esai", "Laporan"] };
export const categorySlugs: Record<Kind, string> = { "Top up game": "top-up-game", "PPOB": "ppob", "Booster media sosial": "sosial-media", "Aplikasi premium": "aplikasi-premium", "Joki tugas": "format-tugas" };
export const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sourceFor = (kind: string | null) => kind === "Top up game" ? "game" : kind === "PPOB" ? "prepaid" : kind === "Aplikasi premium" ? "apps" : kind === "Booster media sosial" ? "social" : "tasks";
const money = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
export function Catalog({ initialCategory = "Semua", initialQuery = "", initialProduct = "", initialProductSlug = "", initialVariant = "" }: { initialCategory?: string; initialQuery?: string; initialProduct?: string; initialProductSlug?: string; initialVariant?: string }) {
 const router = useRouter(); const reduce = useReducedMotion(); const reveal = useReveal();
 const [kind] = useState<Kind | null>(initialCategory in choices ? initialCategory as Kind : null);
 const [product, setProduct] = useState(initialProduct); const [query, setQuery] = useState(initialQuery); const [step, setStep] = useState(initialProduct || initialProductSlug ? 1 : 0);
 const progressRef = useRef<HTMLElement>(null); const previousStep = useRef(step);
 const [customerEmail, setCustomerEmail] = useState("");
 const { accountEmail, loading: emailLoading } = useCheckoutEmail();
 const checkoutEmail = accountEmail ?? customerEmail;
 const [variant, setVariant] = useState(""); const [target, setTarget] = useState(""); const [targetZone, setTargetZone] = useState(""); const [contact, setContact] = useState("");
 const [socialQuantity, setSocialQuantity] = useState(0);
 const [catalogItems, setCatalogItems] = useState<LiveProduct[]>([]); const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
 const [reload, setReload] = useState(0);
 const [searchProducts, setSearchProducts] = useState<CatalogProduct[]>([]);
 const [flashOffers, setFlashOffers] = useState<(CatalogItem & {category: Kind})[]>([]);
 const [searchState, setSearchState] = useState<"loading" | "ready" | "error">("loading");
 const [now,setNow] = useState(0); const clockOffset = useRef(0);
 const scrollToResults = () => {
  const results = document.getElementById("catalog-results") ?? document.getElementById("catalog-browse");
  results?.focus({ preventScroll: true });
  results?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
 };
 useEffect(() => {
  if (!initialQuery.trim()) return;
  const results = document.getElementById("catalog-results");
  results?.focus({ preventScroll: true });
  results?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
 }, [initialQuery, reduce]);
 useEffect(() => { const tick=()=>setNow(Date.now()+clockOffset.current); tick(); const timer=window.setInterval(tick,1000); return()=>window.clearInterval(timer); },[]);
 const gameFlow = kind === "Top up game";
 const liveKind = !!kind;
 const mobileLegendsDestinationValid = product !== "Mobile Legends" || (/^[0-9]+$/.test(target.trim()) && /^[0-9]+$/.test(targetZone.trim()));
 useEffect(() => {
  if (step > 0) return;
  const controller = new AbortController();
  const sources = [["game", "Top up game"], ["prepaid", "PPOB"], ["apps", "Aplikasi premium"], ["social", "Booster media sosial"], ["tasks", "Joki tugas"]] as const;
  setSearchState("loading");
  const refresh=()=>{Promise.allSettled(sources.map(async ([source, category]) => {
   const response = await fetch(`${apiUrl}/catalog/${source}`, {signal: controller.signal, cache:"no-store"});
   if (!response.ok) throw new Error();
   const data = await response.json() as CatalogFeed;
   if (!Array.isArray(data.products) || data.products.some(item => typeof item.name !== "string")) throw new Error();
   if (Number.isFinite(Date.parse(data.serverTime))) clockOffset.current=Date.parse(data.serverTime)-Date.now();
   return { products: data.products.map(item => ({...item, category})), items: data.items.map(item => ({...item, category})) };
  })).then(results => {
   if (controller.signal.aborted) return;
   setSearchProducts(results.flatMap(result => result.status === "fulfilled" ? result.value.products : []));
   setFlashOffers(results.flatMap(result => result.status === "fulfilled" ? result.value.items : []));
   setSearchState(results.some(result => result.status === "rejected") ? "error" : "ready");
  });
  };
  refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")refresh();},30000);
  window.addEventListener("focus",refresh);
  return () => {controller.abort();window.clearInterval(timer);window.removeEventListener("focus",refresh);};
 }, [kind, reload, step]);
 useEffect(() => {
  if (step === 0) return;
  if (!liveKind) return;
  const controller = new AbortController(); setCatalogState("loading"); setVariant(""); setCatalogItems([]);
  let initialized=false;
  const refresh=()=>{fetch(`${apiUrl}/catalog/${sourceFor(kind)}`, { signal: controller.signal, cache:"no-store" })
   .then(response => { if (!response.ok) throw new Error(); return response.json(); })
   .then((data: CatalogFeed) => {
    if (controller.signal.aborted) return;
    if (!Array.isArray(data.items) || data.items.some(item => typeof item.code !== "string" || typeof item.product !== "string" || typeof item.productSlug !== "string" || !Number.isSafeInteger(item.price) || item.price <= 0)) throw new Error();
    if (Number.isFinite(Date.parse(data.serverTime))) {clockOffset.current=Date.parse(data.serverTime)-Date.now();setNow(Date.now()+clockOffset.current);}
    const resolvedProduct = initialProductSlug ? data.items.find(item=>item.productSlug===initialProductSlug)?.product : initialProduct;
    setCatalogItems(data.items);
    const firstLoad=!initialized;
    setVariant(previous=>{
     const choice=firstLoad&&initialVariant?initialVariant:previous;
     return data.items.some(item=>item.code===choice && item.product===resolvedProduct)?choice:"";
    });
    initialized=true;
    if (initialProductSlug) setProduct(data.items.find(item => item.productSlug === initialProductSlug)?.product ?? initialProduct);
    setCatalogState("ready");
   })
   .catch(() => { if (!controller.signal.aborted) setCatalogState("error"); });
  };
  refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")refresh();},30000);
  window.addEventListener("focus",refresh);
  return () => {controller.abort();window.clearInterval(timer);window.removeEventListener("focus",refresh);};
 }, [kind, initialProduct, initialProductSlug, initialVariant, liveKind, reload, step===0]);
 const productItems = catalogItems.filter(item => initialProductSlug ? item.productSlug === initialProductSlug : item.product === product);
 const [pages, setPages] = useState(5); const [days, setDays] = useState(7); const [revisions, setRevisions] = useState(1); const [theme, setTheme] = useState(""); const [referenceUrl,setReferenceUrl]=useState(""); const [taskQuote,setTaskQuote]=useState<number|null>(null); const [taskQuoteError,setTaskQuoteError]=useState(""); const [service, setService] = useState("Followers");
 useEffect(() => { if (step !== previousStep.current && step > 0) progressRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); previousStep.current = step; }, [step, reduce]);
 const selectedLive = productItems.find(item => item.code === variant);
 useEffect(() => { if (kind === "Booster media sosial" && selectedLive) setSocialQuantity(selectedLive.minimum ?? selectedLive.serviceQuantity ?? 1); }, [kind, selectedLive?.code, selectedLive?.minimum, selectedLive?.serviceQuantity]);
 useEffect(()=>{
  if(kind!=="Joki tugas" || !selectedLive){setTaskQuote(null);return;}
  const controller=new AbortController();setTaskQuote(null);setTaskQuoteError("");
  const timer=window.setTimeout(()=>{void fetch(`${apiUrl}/payments/task-quote`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:selectedLive.code,pages,deadlineDays:days,revisions}),signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(typeof data.message==="string"?data.message:"Tarif belum tersedia.");if(!controller.signal.aborted)setTaskQuote(data.amount);}).catch(error=>{if(!controller.signal.aborted)setTaskQuoteError(error instanceof Error?error.message:"Tarif belum tersedia.");});},250);
  return()=>{controller.abort();window.clearTimeout(timer)};
 },[kind,selectedLive?.code,pages,days,revisions]);
 const activeProductOffers = kind ? tidyVariants(productItems.filter(item => isPromotionActive(item.promotion, now))).map(item => ({ ...item, category: kind })) : [];
 const productOffers = activeProductOffers;
 const price = kind === "Joki tugas" ? taskQuote ?? 0 : kind === "Booster media sosial" && selectedLive ? Math.ceil((selectedLive.unitPrice ?? selectedLive.price) * socialQuantity / 1000) : liveKind ? selectedLive ? currentPrice(selectedLive,now) : 0 : variant.includes("100") ? 25000 : 15000;
 const orderDetails = liveKind ? selectedLive ? `${selectedLive.name} Ã‚Â· ${selectedLive.group} Ã‚Â· ${selectedLive.code}` : "" : kind === "Joki tugas" ? `${theme}, ${pages} halaman, ${days} hari, ${revisions} revisi` : kind === "Booster media sosial" ? `${service}, ${variant}` : variant;
 const start = (value: string, category: Kind = kind!, code?: string, selectedSlug?: string) => {
  const slug = selectedSlug || (code ? flashOffers.find(item=>item.code===code&&item.category===category)?.productSlug : undefined)
   || searchProducts.find(item=>item.name===value&&item.category===category)?.slug
   || (category===kind?catalogItems.find(item=>item.product===value)?.productSlug:undefined) || slugify(value);
  router.push(`/katalog/${categorySlugs[category]}/${slug}${code ? `?pilihan=${encodeURIComponent(code)}` : ""}`);
 };
 const reset = () => { if (kind) router.push(`/katalog/${categorySlugs[kind]}`); else router.push("/katalog"); };
 const categoryName = (name: string) => name;
 const browseProducts = searchProducts;
 return <div className="shop-flow">
  <motion.div className={`shop-heading${step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] ? " shop-heading-game" : ""}`} {...reveal()}><div className="shop-heading-copy"><span className="shop-kicker">Katalog Anres</span>{step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] ? <><div className="shop-heading-game-title"><span className="shop-heading-game-icon"><img src={gameArtwork[product]} alt=""/></span><span><h1><TextGenerateEffect as="span" words={product} duration={.3}/></h1><small>{gameDevelopers[product]}</small></span></div><p>Lengkapi pesananmu dengan mudah.</p></> : <><h1><TextGenerateEffect key={`${step}:${kind}:${product}`} as="span" words={step ? product || (catalogState === "ready" ? "Produk tidak tersedia" : "Memuat produk...") : kind || "Semua kebutuhan digitalmu."} duration={.3}/></h1><p>{step ? "Lengkapi pesananmu dengan mudah." : "Pilih layanan, temukan produk, dan lanjutkan harimu."}</p></>}</div>{step > 0 && kind === "Top up game" && gameArtwork[product] && gameCoverArtwork[product] && <span className="shop-heading-game-art" aria-hidden="true"><img src={gameCoverArtwork[product]} alt=""/></span>}{step > 0 ? <button className="shop-back" onClick={() => step === 1 ? reset() : setStep(step - 1)}><ArrowLeft size={16}/>Kembali</button> : <form className="shop-search shop-hero-search" role="search" onSubmit={event=>{event.preventDefault();scrollToResults();}}><Search size={19} aria-hidden="true"/><Input aria-label="Cari produk" type="search" placeholder="Cari game atau layanan" value={query} onChange={event=>setQuery(event.target.value)}/><button type="submit" aria-label="Cari"><ArrowRight size={18}/></button></form>}</motion.div>
  {step === 0 && !kind && !query.trim() && <CatalogOverview/>}
  {step === 0 && <div id="catalog-browse" tabIndex={-1}><CatalogBrowse offers={flashOffers} products={browseProducts} initialCategory={kind || "Semua"} query={query} state={searchState} retry={()=>setReload(value=>value+1)} onSelect={(name,category,code)=>start(name,category,code)} now={now}/></div>}
  {step > 0 && kind && <div className="order-layout"><div className="order-main"><nav ref={progressRef} className="order-progress" aria-label="Tahap pesanan">{(gameFlow ? ["Pilih nominal", "Data game", "Checkout & pembayaran"] : ["Detail pesanan", "Checkout & pembayaran"]).map((label, i) => <span key={label} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}><b>{i + 1}</b>{label}</span>)}</nav>
  <motion.div key={step} initial={{opacity:0,y:12,filter:"blur(5px)"}} animate={{opacity:1,y:0,filter:"blur(0px)"}} transition={{duration:reduce?0:.3}}>{step === 1 && !gameFlow && <>{productOffers.length > 0 && <FlashSale offers={productOffers} state="ready" now={now} selectedCode={variant} onSelect={(_name,_category,code) => { if (!code) return; setVariant(code); window.requestAnimationFrame(() => { const list = document.getElementById("variant-heading"); list?.focus({preventScroll:true}); list?.scrollIntoView({behavior:reduce ? "auto" : "smooth",block:"start"}); }); }}/>}<div className="order-card"><h2><TextGenerateEffect as="span" words="Detail pesanan" duration={.22}/></h2><p>Isi informasi berikut untuk {product}.</p>
   {liveKind && <><label>{kind === "Joki tugas" ? "Ringkasan kebutuhan / tautan dokumen" : kind === "Booster media sosial" ? "Link akun atau konten publik" : kind === "Aplikasi premium" ? "Email / tujuan layanan" : "Nomor tujuan / ID pelanggan"}<Input maxLength={200} value={target} onChange={e => setTarget(e.target.value)} placeholder={kind === "Joki tugas" ? "Jenis tugas, tenggat, atau tautan dokumen (maks. 200 karakter)" : kind === "Booster media sosial" ? "https://... (ikuti ketentuan layanan)" : kind === "Aplikasi premium" ? "Ikuti keterangan layanan, jangan masukkan kata sandi" : "Masukkan nomor tujuan"}/></label>{kind === "Booster media sosial" && selectedLive && <div className="task-order-options"><label>Jumlah item<Input type="number" min={selectedLive.minimum ?? 1} max={selectedLive.maximum ?? 10000000} step={1} value={socialQuantity || ""} onChange={e => setSocialQuantity(Number(e.target.value))} required/></label><p>Min. {(selectedLive.minimum ?? 1).toLocaleString("id-ID")} Â· Maks. {(selectedLive.maximum ?? 10000000).toLocaleString("id-ID")} item. Tarif per 1.000 item.</p></div>}{selectedLive?.fulfillmentMode === "manual" && <p className="catalog-manual-note">Pesanan dikerjakan tim Anres setelah pembayaran terverifikasi. Detail pengerjaan dikoordinasikan melalui kontak pesanan; jangan masukkan kata sandi.</p>}{kind==="Joki tugas"&&<div className="task-order-options"><label>Instruksi tugas<textarea required minLength={10} maxLength={3000} value={theme} onChange={e=>setTheme(e.target.value)} placeholder="Jenis tugas, topik, format, dan ketentuan hasil"/></label><label>Tautan bahan (opsional)<Input type="url" maxLength={500} value={referenceUrl} onChange={e=>setReferenceUrl(e.target.value)} placeholder="https://..."/></label><div className="task-order-grid"><label>Jumlah halaman<Input type="number" min={1} max={500} value={pages} onChange={e=>setPages(Number(e.target.value))}/></label><label>Tenggat (hari)<Input type="number" min={1} max={90} value={days} onChange={e=>setDays(Number(e.target.value))}/></label><label>Revisi dibeli<Input type="number" min={0} max={20} value={revisions} onChange={e=>setRevisions(Number(e.target.value))}/></label></div>{taskQuoteError&&<p role="alert">{taskQuoteError}</p>}{taskQuote!==null&&<p role="status">Harga tugas: {money(taskQuote)}</p>}</div>}<CatalogVariants items={productItems} selected={variant} onSelect={setVariant} state={catalogState} onRetry={()=>setReload(value=>value+1)} now={now}/></>}
   <label>Nomor WhatsApp atau email<Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Untuk informasi pesanan"/></label><Button variant="outline" className="order-cart-add" disabled={kind==="Joki tugas" || kind==="Aplikasi premium" || !target.trim() || !contact.trim() || (kind === "Booster media sosial" && (!selectedLive || !Number.isSafeInteger(socialQuantity) || socialQuantity < (selectedLive.minimum ?? 1) || socialQuantity > (selectedLive.maximum ?? 10000000))) || (liveKind ? catalogState !== "ready" || !selectedLive : kind === "Joki tugas" ? !theme.trim() : !variant)} onClick={async () => { try { await initCart(); const details = orderDetails; const items = readCart(); items.push({ id: crypto.randomUUID(), product, category: kind, details, source: sourceFor(kind), serviceQuantity: kind === "Booster media sosial" ? socialQuantity : selectedLive?.serviceQuantity, code: selectedLive?.code, target, contact, price, quantity: 1 }); await writeCart(items); window.dispatchEvent(new Event("anres-cart-open")); } catch (error) { window.alert(error instanceof Error ? error.message : "Keranjang tidak dapat disimpan. Coba lagi."); } }}><ShoppingCart size={17}/>Tambah ke keranjang</Button><Button className="order-primary" disabled={(kind==="Joki tugas" && (taskQuote===null || theme.trim().length<10)) || !target.trim() || !contact.trim() || (kind === "Booster media sosial" && (!selectedLive || !Number.isSafeInteger(socialQuantity) || socialQuantity < (selectedLive.minimum ?? 1) || socialQuantity > (selectedLive.maximum ?? 10000000))) || (liveKind ? catalogState !== "ready" || !selectedLive : kind === "Joki tugas" ? !theme.trim() : !variant)} onClick={() => setStep(2)}>Lanjut ke checkout<ArrowRight size={17}/></Button></div></>}
  {gameFlow && step === 1 && <>{productOffers.length > 0 && <FlashSale offers={productOffers} state="ready" now={now} selectedCode={variant} onSelect={(_name,_category,code) => { if (!code) return; setVariant(code); window.requestAnimationFrame(() => { const list = document.getElementById("variant-heading"); list?.focus({preventScroll:true}); list?.scrollIntoView({behavior:reduce ? "auto" : "smooth",block:"start"}); }); }}/>}<div className="order-card"><CatalogVariants items={productItems} selected={variant} onSelect={setVariant} onSelected={()=>document.getElementById("game-variant-continue")?.scrollIntoView({behavior:reduce ? "auto" : "smooth",block:"center"})} state={catalogState} onRetry={()=>setReload(value=>value+1)} now={now}/><Button id="game-variant-continue" className="order-primary" disabled={catalogState !== "ready" || !selectedLive} onClick={() => setStep(2)}>Lanjut isi data<ArrowRight size={17}/></Button></div></>}
  {gameFlow && step === 2 && <div className="order-card"><h2>Isi data game</h2><p>Masukkan tujuan dan kontak untuk pesanan {product}.</p><label>{product === "Roblox" ? "Email / nomor WhatsApp" : "ID pemain"}<Input value={target} maxLength={200} inputMode={product === "Mobile Legends" ? "numeric" : undefined} onChange={e=>setTarget(e.target.value)} placeholder={product === "Roblox" ? "Masukkan email atau nomor WhatsApp" : "Masukkan ID pemain"}/></label>{product !== "Roblox" && <label>ID server / zone {product === "Mobile Legends" ? "(wajib)" : "(Opsional)"}<Input value={targetZone} maxLength={100} inputMode={product === "Mobile Legends" ? "numeric" : undefined} onChange={e=>setTargetZone(product === "Mobile Legends" ? e.target.value : e.target.value.replace(/[^A-Za-z0-9_-]/g,""))} placeholder="Contoh: 1234"/></label>}{product === "Mobile Legends" && <p className="catalog-destination-hint">Masukkan ID pemain dan server / zone di kolom terpisah, hanya angka tanpa tanda kurung.{(target.trim() || targetZone.trim()) && !mobileLegendsDestinationValid && <strong role="status"> Periksa kembali kedua kolom sebelum melanjutkan.</strong>}</p>}<label>{accountEmail ? "Email akun" : "Email (Wajib)"}<Input type="email" autoComplete="email" maxLength={254} value={checkoutEmail} readOnly={!!accountEmail} required disabled={emailLoading} onChange={e=>setCustomerEmail(e.target.value)} placeholder="nama@email.com"/></label><label>Nomor WhatsApp (Opsional)<Input type="tel" autoComplete="tel" value={contact} onChange={e=>setContact(e.target.value)} placeholder="081234567890"/></label><Button variant="outline" className="order-cart-add" disabled={!target.trim() || !mobileLegendsDestinationValid || (emailLoading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail.trim())) || (!!contact.trim() && !/^\+?[0-9]{8,15}$/.test(contact.trim())) || catalogState !== "ready" || !selectedLive} onClick={async () => { try { await initCart(); const items = readCart(); items.push({ id: crypto.randomUUID(), product, category: kind, details: orderDetails, source: "game", code: selectedLive?.code, targetZone, target, contact, price, quantity: 1 }); await writeCart(items); window.dispatchEvent(new Event("anres-cart-open")); } catch (error) { window.alert(error instanceof Error ? error.message : "Keranjang tidak dapat disimpan. Coba lagi."); } }}><ShoppingCart size={17}/>Tambah ke keranjang</Button><Button className="order-primary" disabled={!target.trim() || !mobileLegendsDestinationValid || (emailLoading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail.trim())) || (!!contact.trim() && !/^\+?[0-9]{8,15}$/.test(contact.trim())) || catalogState !== "ready" || !selectedLive} onClick={()=>setStep(3)}>Lanjut ke checkout<ArrowRight size={17}/></Button></div>}
  {(gameFlow ? step === 3 : step === 2) && <div className="order-card"><h2><TextGenerateEffect as="span" words="Checkout & pembayaran" duration={.22}/></h2><p>Periksa pesananmu, lalu pilih metode pembayaran di bawah.</p><dl><div><dt>Produk</dt><dd>{product}</dd></div><div><dt>Pilihan</dt><dd>{kind === "Aplikasi premium" && selectedLive && selectedLive.section !== "Pilihan akses" ? `${selectedLive.section} · ${selectedLive.displayName}` : selectedLive?.displayName || orderDetails}{kind === "Booster media sosial" && selectedLive ? ` Â· ${socialQuantity.toLocaleString("id-ID")} item` : ""}</dd></div><div><dt>{gameFlow ? "ID pemain" : "Tujuan / detail"}</dt><dd>{target}</dd></div>{gameFlow && targetZone && <div><dt>Server / zone</dt><dd>{targetZone}</dd></div>}{gameFlow && <><div><dt>Email</dt><dd>{checkoutEmail}</dd></div></>}<div><dt>Kontak</dt><dd>{contact || "Tidak diisi"}</dd></div><div><dt>Total</dt><dd>{money(price)}</dd></div></dl><CheckoutVoucher/>{kind === "Aplikasi premium" && selectedLive ? <PremiumCheckout code={selectedLive.code} amount={price}/> : liveKind && selectedLive ? <PaymentCheckout source={sourceFor(kind)} code={selectedLive.code} task={kind==="Joki tugas"?{pages,deadline_days:days,revisions,instructions:theme,reference_url:referenceUrl}:undefined} serviceQuantity={kind === "Booster media sosial" ? socialQuantity : selectedLive.serviceQuantity} target={target} targetZone={gameFlow ? targetZone : ""} amount={price} contact={contact} customer={gameFlow ? {email:checkoutEmail, phone:contact} : undefined}/> : <p role="alert">Produk tidak tersedia. Kembali dan pilih ulang produk dari katalog.</p>}</div>}
</motion.div></div><motion.aside className="order-summary" {...reveal(.08)}><span>Ringkasan pesanan</span><h3>{product}</h3><p>{categoryName(kind)}</p><hr/><div><span>Total</span><strong>{money(price)}</strong></div>{selectedLive && isPromotionActive(selectedLive.promotion,now) && <FlashSaleInfo variant="summary" promotion={selectedLive.promotion!} now={now}/>}<small>Periksa kembali pilihan dan tujuan sebelum melanjutkan.</small></motion.aside></div>}
 </div>;
}



