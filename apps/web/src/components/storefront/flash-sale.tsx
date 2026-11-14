"use client";
import { useEffect, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { AppWindow, FileText, Gamepad2, Smartphone, Users } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { artwork, gameArtwork } from "./catalog-product-card";
import { FlashFlame, FlashSaleInfo } from "./flash-sale-info";
import { type CatalogItem, type CatalogKind } from "@/lib/catalog";

type Offer = CatalogItem & { category: CatalogKind };
const icons: Record<CatalogKind, typeof Gamepad2> = { "Top up game": Gamepad2, "Aplikasi premium": AppWindow, "Joki tugas": FileText, "Booster media sosial": Users, PPOB: Smartphone };
export function FlashSale({ offers, state, now, onSelect, demo = false, demoSelectable = false, selectedCode }: { selectedCode?: string; demo?: boolean; demoSelectable?: boolean; offers: Offer[]; state: "loading" | "ready" | "error"; now: number; onSelect: (name: string, category: CatalogKind, code?: string) => void }) {
 const reduced = useReducedMotion();
 const autoplay = useMemo(() => Autoplay({ delay: 2500, playOnInit: true, jump: false, stopOnInteraction: false, stopOnMouseEnter: true, stopOnFocusIn: true }), []);
 const [viewportRef, carousel] = useEmblaCarousel({ align: "start", loop: false, watchDrag: true }, reduced ? [] : [autoplay]);
 useEffect(() => {
  if (!carousel || reduced || offers.length < 2) return;
  const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) autoplay.play(); else autoplay.stop(); }, { threshold: .3 });
  observer.observe(carousel.rootNode()); return () => { observer.disconnect(); autoplay.stop(); };
 }, [carousel, reduced, offers.length, autoplay]);
 const first = offers[0];
 return <section className="catalog-flash" aria-labelledby="flash-title">
  <div className="catalog-flash-heading"><div><div className="flash-title-row"><FlashFlame/><h2 id="flash-title">Flash sale</h2></div><p>{demo ? "Data contoh; harga asli ditampilkan pada pilihan produk." : "Harga spesial untuk pilihan ini."}</p></div>{first?.promotion && <div className="flash-deadline"><FlashSaleInfo variant="countdown" promotion={first.promotion} now={now}/></div>}</div>
  {offers.length ? <><div className="flash-offers" ref={viewportRef} tabIndex={0} aria-label="Daftar flash sale"><div className="flash-offers-track">{offers.map(item => { const Icon = icons[item.category]; const image = gameArtwork[item.product] || artwork[item.product]; return <button type="button" className="flash-offer" aria-pressed={selectedCode === undefined ? undefined : selectedCode === item.code} key={`${item.category}:${item.code}`} onClick={() => onSelect(item.product,item.category,demo && !demoSelectable ? undefined : item.code)}><span className="flash-ribbon">-{item.promotion!.discountPercent}%</span><span className="flash-offer-icon" aria-hidden="true">{image ? <img src={image} alt="" loading="lazy"/> : <Icon size={27}/>}</span><span className="flash-offer-copy"><strong>{item.product}{demo && " · Contoh"}</strong><span>{item.displayName}</span><FlashSaleInfo variant="price" promotion={item.promotion!} price={item.price} now={now} showCountdown={false}/></span></button>; })}</div></div></> : <p className="flash-empty" role="status">{state === "loading" ? "Menyiapkan pilihan promo..." : state === "error" ? "Promo belum dapat dimuat. Coba muat ulang katalog." : "Belum ada promo aktif. Jelajahi pilihan di bawah ini."}</p>}
 </section>;
}
