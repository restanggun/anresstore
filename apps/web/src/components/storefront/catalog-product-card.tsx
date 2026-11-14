"use client";

import { AppWindow, ArrowUpRight, FileText, Gamepad2, Smartphone, Star, Users, Wallet, Wifi, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";

export const gameArtwork: Record<string, string> = {
  "Mobile Legends": "/brand/games/mobile-legends.png", "Free Fire": "/brand/games/free-fire.png", Roblox: "/brand/games/roblox.png",
  "PUBG Mobile": "/brand/games/pubg-mobile.png", "Genshin Impact": "/brand/games/genshin-impact.png", Valorant: "/brand/products/valorant.svg",
  ...Object.fromEntries(Object.entries({"EA SPORTS FC Mobile":"ea-sports-fc-mobile", "Magic Chess: Go Go":"magic-chess-go-go", "Whiteout Survival":"whiteout-survival", "Honkai Star Rail":"honkai-star-rail", "Honor of Kings Global":"honor-of-kings-global", "Delta Force (Garena)":"delta-force-garena", "Call of Duty Mobile (Indonesia)":"call-of-duty-mobile-indonesia", "Arena Breakout":"arena-breakout", "Blood Strike":"blood-strike", "Love and Deepspace":"love-and-deepspace", "Zenless Zone Zero":"zenless-zone-zero", "Identity V":"identity-v", "Lords Mobile":"lords-mobile", "War Robots":"war-robots", "Age of Empires Mobile":"age-of-empires-mobile"}).map(([name,slug]) => [name, `/brand/games/${slug}.jpg`])),
};
export const gameCoverArtwork: Record<string, string> = {
  "Mobile Legends": "/brand/games/covers/mobile-legends.jpg",
  "Free Fire": "/brand/games/covers/free-fire.jpg",
  Roblox: "/brand/games/covers/roblox.jpg",
  "PUBG Mobile": "/brand/games/covers/pubg-mobile.jpg",
  "Genshin Impact": "/brand/games/covers/genshin-impact.jpg",
  Valorant: "/brand/games/covers/valorant.jpg",
  ...Object.fromEntries(Object.entries({"EA SPORTS FC Mobile":"ea-sports-fc-mobile", "Magic Chess: Go Go":"magic-chess-go-go", "Whiteout Survival":"whiteout-survival", "Honkai Star Rail":"honkai-star-rail", "Honor of Kings Global":"honor-of-kings-global", "Delta Force (Garena)":"delta-force-garena", "Call of Duty Mobile (Indonesia)":"call-of-duty-mobile-indonesia", "Arena Breakout":"arena-breakout", "Blood Strike":"blood-strike", "Love and Deepspace":"love-and-deepspace", "Zenless Zone Zero":"zenless-zone-zero", "Identity V":"identity-v", "Lords Mobile":"lords-mobile", "War Robots":"war-robots.png", "Age of Empires Mobile":"age-of-empires-mobile"}).map(([name,slug]) => [name, `/brand/games/covers/${slug.includes('.') ? slug : `${slug}.jpg`}`])),
};
export const artwork: Record<string, string> = {
  ...gameArtwork,
  Instagram: "/brand/social/instagram.svg", TikTok: "/brand/social/tiktok.svg", YouTube: "/brand/social/youtube.svg", Facebook: "/brand/social/facebook.svg",
  Claude: "/brand/products/claude.svg", Netflix: "/brand/products/netflix.svg", Spotify: "/brand/products/spotify.svg",
};
export const gameDevelopers: Record<string, string> = {
  "Mobile Legends": "Moonton",
  "Free Fire": "Garena",
  Roblox: "Roblox Corporation",
  "PUBG Mobile": "Tencent Games",
  "Genshin Impact": "HoYoverse",
  Valorant: "Riot Games",
  "EA SPORTS FC Mobile": "Electronic Arts", "Magic Chess: Go Go": "Moonton", "Whiteout Survival": "Century Games", "Honkai Star Rail": "HoYoverse", "Honor of Kings Global": "TiMi Studio Group", "Delta Force (Garena)": "Team Jade", "Call of Duty Mobile (Indonesia)": "TiMi Studio Group", "Arena Breakout": "MoreFun Studios", "Blood Strike": "NetEase Games", "Love and Deepspace": "Papergames", "Zenless Zone Zero": "HoYoverse", "Identity V": "NetEase Games", "Lords Mobile": "IGG", "War Robots": "Pixonic", "Age of Empires Mobile": "TiMi Studio Group",
};
const icons: Record<string, typeof Gamepad2> = {
  "Top up game": Gamepad2, "Booster media sosial": Users, "Aplikasi premium": AppWindow, "Joki tugas": FileText, PPOB: Smartphone,
};
const gamePreviews: Record<string,string> = {
  "War Robots": "/brand/games/previews/war-robots.webm",
  "Zenless Zone Zero": "/brand/games/previews/zenless-zone-zero.webm",
  "Delta Force (Garena)": "/brand/games/previews/delta-force-garena.webm",
  "Blood Strike": "/brand/games/previews/blood-strike.webm",
  "Lords Mobile": "/brand/games/previews/lords-mobile.webm",
};

export function CatalogProductCard({ name, category, developer, pinned = false, label = "Lihat pilihan", index = 0, onSelect }: {
  name: string; category: string; developer?: string; pinned?: boolean; label?: string; index?: number; onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const [preview, setPreview] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const Icon = icons[category] ?? AppWindow;
  const PpobIcon = ({ "Pulsa": Smartphone, "Paket data": Wifi, "Token listrik": Zap, "E-wallet": Wallet } as Record<string, typeof Smartphone>)[name] ?? Smartphone;
  const image = artwork[name];
  const cover = category === "Top up game" ? gameCoverArtwork[name] : undefined;
  const video = cover && category === "Top up game" ? gamePreviews[name] : undefined;
  const stopPreview = () => { setPreview(false); setVideoReady(false); };
  return <motion.button type="button" tabIndex={0} className="catalog-product-card" onClick={onSelect}
    onMouseEnter={() => { if (!reduce && video) setPreview(true); }} onMouseLeave={stopPreview}
    onFocus={() => { if (!reduce && video) setPreview(true); }} onBlur={stopPreview}
    initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}
    transition={{ duration: reduce ? 0 : .35, delay: reduce ? 0 : Math.min(index, 5) * .04 }}
    whileHover={reduce ? undefined : { y: -4 }} whileTap={reduce ? undefined : { scale: .99 }}>
    <span className={`catalog-product-art${category === "PPOB" ? " catalog-product-art-ppob" : ""}`} aria-hidden="true">{category === "PPOB" ? <span className="ppob-thumbnail"><PpobIcon size={46} strokeWidth={1.5}/></span> : cover ? <img className="catalog-product-cover" src={cover} alt="" loading="lazy"/> : image ? <img src={image} alt="" loading="lazy"/> : <Icon size={38} strokeWidth={1.5} />}{preview && video && <video className={`catalog-product-video${videoReady ? " is-ready" : ""}`} src={video} autoPlay muted loop playsInline preload="metadata" onCanPlay={()=>setVideoReady(true)} onError={stopPreview}/>} {pinned && <span className="catalog-product-pin"><Star size={17} fill="currentColor" strokeWidth={1.8}/></span>}</span>{pinned && <span className="sr-only">Produk pilihan. </span>}
    <span className="catalog-product-content">
      {category === "PPOB" ? <span className="catalog-product-game-heading"><span className="catalog-product-game-icon ppob-heading-icon" aria-hidden="true"><PpobIcon size={22}/></span><span className="catalog-product-game-copy"><TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/><span className="catalog-product-developer">PPOB</span></span></span> : cover && image ? <span className="catalog-product-game-heading"><span className="catalog-product-game-icon" aria-hidden="true"><img src={image} alt="" loading="lazy"/></span><span className="catalog-product-game-copy"><TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/>{(developer || gameDevelopers[name]) && <span className="catalog-product-developer">{developer || gameDevelopers[name]}</span>}</span></span> : <TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/>}
      {!cover && category !== "PPOB" && (category === "Top up game" ? (developer || gameDevelopers[name]) && <span className="catalog-product-developer">{developer || gameDevelopers[name]}</span> : <span className="catalog-product-category">{category}</span>)}
      <span className="catalog-product-action">{label}<ArrowUpRight size={16}/></span>
    </span>
  </motion.button>;
}

