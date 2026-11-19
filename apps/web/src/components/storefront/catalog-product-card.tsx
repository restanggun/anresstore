"use client";

import { AppWindow, ArrowUpRight, FileText, Gamepad2, Smartphone, Star, Users, Wallet, Wifi, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
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
const appSlugs: Record<string, string> = {
  Zoom: "zoom", Loklok: "loklok", Claude: "claude-ai", "Claude AI": "claude-ai",
  iQIYI: "iqiyi", PicsArt: "picsart", Vidio: "vidio", Canva: "canva",
  CapCut: "capcut", ChatGPT: "chatgpt", Gemini: "gemini", "Alight Motion": "alight-motion",
};
export const appArtwork: Record<string, string> = Object.fromEntries(
  Object.entries(appSlugs).map(([name, slug]) => [name, `/brand/apps/${slug}-icon.webp`]),
);
export const appCoverArtwork: Record<string, string> = Object.fromEntries(
  Object.entries(appSlugs).map(([name, slug]) => [name, `/brand/apps/${slug}-thumbnail.webp`]),
);
export const socialArtwork: Record<string, string> = {
  Instagram: "/brand/social/instagram.svg", TikTok: "/brand/social/tiktok.svg",
  YouTube: "/brand/social/youtube.svg", Facebook: "/brand/social/facebook.svg",
  Telegram: "/brand/social/telegram.svg", Twitter: "/brand/social/x.svg",
  "X": "/brand/social/x.svg", WhatsApp: "/brand/social/whatsapp.svg",
  Threads: "/brand/social/threads.svg", Spotify: "/brand/products/spotify.svg",
};
export const artwork: Record<string, string> = {
  ...gameArtwork,
  ...appArtwork,
  ...socialArtwork,
  Netflix: "/brand/products/netflix.svg", Spotify: "/brand/products/spotify.svg",
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
export const gamePreviews: Record<string,string> = {
  "Mobile Legends": "/brand/games/previews/mobile-legends.mp4?v=20261116",
  "Free Fire": "/brand/games/previews/free-fire.mp4?v=20261116",
  "PUBG Mobile": "/brand/games/previews/pubg-mobile.mp4?v=20261116",
  "EA SPORTS FC Mobile": "/brand/games/previews/ea-sports-fc-mobile.mp4?v=20261116",
  "Magic Chess: Go Go": "/brand/games/previews/magic-chess-go-go.mp4?v=20261116",
  "Whiteout Survival": "/brand/games/previews/whiteout-survival.mp4?v=20261116",
  "Honkai Star Rail": "/brand/games/previews/honkai-star-rail.mp4?v=20261116",
  "Honor of Kings Global": "/brand/games/previews/honor-of-kings-global.mp4?v=20261116",
  "Delta Force (Garena)": "/brand/games/previews/delta-force-garena.mp4?v=20261116",
  "Genshin Impact": "/brand/games/previews/genshin-impact.mp4?v=20261116",
  Valorant: "/brand/games/previews/valorant.mp4?v=20261116",
  Roblox: "/brand/games/previews/roblox.mp4?v=20261116",
  "Call of Duty Mobile (Indonesia)": "/brand/games/previews/call-of-duty-mobile-indonesia.mp4?v=20261116",
  "Arena Breakout": "/brand/games/previews/arena-breakout.mp4?v=20261116",
  "Blood Strike": "/brand/games/previews/blood-strike.mp4?v=20261116",
  "Love and Deepspace": "/brand/games/previews/love-and-deepspace.mp4?v=20261116",
  "Zenless Zone Zero": "/brand/games/previews/zenless-zone-zero.mp4?v=20261116",
  "Identity V": "/brand/games/previews/identity-v.mp4?v=20261116",
  "Lords Mobile": "/brand/games/previews/lords-mobile.mp4?v=20261116",
  "War Robots": "/brand/games/previews/war-robots.mp4?v=20261116",
  "Age of Empires Mobile": "/brand/games/previews/age-of-empires-mobile.mp4?v=20261116",
};

export function CatalogProductCard({ name, category, developer, pinned = false, ratingCount = 0, averageRating = 0, label = "Lihat pilihan", index = 0, onSelect }: {
  name: string; category: string; developer?: string; pinned?: boolean; ratingCount?: number; averageRating?: number; label?: string; index?: number; onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const [preview, setPreview] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const Icon = icons[category] ?? AppWindow;
  const PpobIcon = ({ "Pulsa": Smartphone, "Paket data": Wifi, "Token listrik": Zap, "E-wallet": Wallet } as Record<string, typeof Smartphone>)[name] ?? Smartphone;
  const image = artwork[name];
  const social = category === "Booster media sosial";
  const cover = category === "Top up game" ? gameCoverArtwork[name] : category === "Aplikasi premium" ? appCoverArtwork[name] : undefined;
  const video = category === "Top up game" ? gamePreviews[name] : undefined;
  useEffect(() => {
    const videoNode = videoRef.current;
    if (!video || !videoNode) return;
    if (preview) {
      videoNode.muted = true;
      videoNode.currentTime = 0;
      videoNode.play().catch(() => undefined);
      return;
    }
    videoNode.pause();
    videoNode.currentTime = 0;
    setVideoReady(false);
  }, [preview, video]);
  const stopPreview = () => { setPreview(false); setVideoReady(false); };
  return <motion.button type="button" tabIndex={0} className="catalog-product-card" onClick={onSelect}
    onMouseEnter={() => { if (!reduce && video) setPreview(true); }} onMouseLeave={stopPreview}
    onFocus={() => { if (!reduce && video) setPreview(true); }} onBlur={stopPreview}
    initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}
    transition={{ duration: reduce ? 0 : .35, delay: reduce ? 0 : Math.min(index, 5) * .04 }}
    whileHover={reduce ? undefined : { y: -4 }} whileTap={reduce ? undefined : { scale: .99 }}>
    <span className={`catalog-product-art${category === "PPOB" ? " catalog-product-art-ppob" : category === "Aplikasi premium" ? " catalog-product-art-apps" : social ? " catalog-product-art-social" : ""}`} aria-hidden="true">{category === "PPOB" ? <span className="ppob-thumbnail"><PpobIcon size={46} strokeWidth={1.5}/></span> : cover ? <img className="catalog-product-cover" src={cover} alt="" loading="lazy"/> : social && image ? <span className="social-thumbnail"><img src={image} alt="" loading="lazy"/></span> : image ? <img src={image} alt="" loading="lazy"/> : <Icon size={38} strokeWidth={1.5} />}{preview && video && <video ref={videoRef} className={`catalog-product-video${videoReady ? " is-ready" : ""}`} src={video} poster={cover} muted loop playsInline preload="metadata" onCanPlay={() => setVideoReady(true)} onLoadedData={() => setVideoReady(true)} onError={stopPreview}/>} {pinned && <span className="catalog-product-pin"><Star size={17} fill="currentColor" strokeWidth={1.8}/></span>}</span>{pinned && <span className="sr-only">Produk pilihan. </span>}{ratingCount > 0 && <span className="catalog-product-rating" aria-label={`Rating ${averageRating.toFixed(1)} dari 5, ${ratingCount} ulasan`}><Star size={13} fill="currentColor" aria-hidden="true"/>{averageRating.toFixed(1)} <span>({ratingCount})</span></span>}
    <span className="catalog-product-content">
      {category === "PPOB" ? <span className="catalog-product-game-heading"><span className="catalog-product-game-icon ppob-heading-icon" aria-hidden="true"><PpobIcon size={22}/></span><span className="catalog-product-game-copy"><TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/><span className="catalog-product-developer">PPOB</span></span></span> : (cover || social) && image ? <span className="catalog-product-game-heading"><span className="catalog-product-game-icon" aria-hidden="true"><img src={image} alt="" loading="lazy"/></span><span className="catalog-product-game-copy"><TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/>{(developer || gameDevelopers[name] || category === "Aplikasi premium" || social) && <span className="catalog-product-developer">{developer || gameDevelopers[name] || category}</span>}</span></span> : <TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/>}
      {!cover && (!social || !image) && category !== "PPOB" && (category === "Top up game" ? (developer || gameDevelopers[name]) && <span className="catalog-product-developer">{developer || gameDevelopers[name]}</span> : <span className="catalog-product-category">{category}</span>)}
      <span className="catalog-product-action">{label}<ArrowUpRight size={16}/></span>
    </span>
  </motion.button>;
}
