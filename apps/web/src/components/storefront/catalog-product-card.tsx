"use client";

import { AppWindow, ArrowUpRight, FileText, Gamepad2, Smartphone, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";

export const gameArtwork: Record<string, string> = {
  "Mobile Legends": "/brand/games/mobile-legends.png", "Free Fire": "/brand/games/free-fire.png", Roblox: "/brand/games/roblox.png",
  "PUBG Mobile": "/brand/games/pubg-mobile.png", "Genshin Impact": "/brand/games/genshin-impact.png", Valorant: "/brand/products/valorant.svg",
};
export const gameCoverArtwork: Record<string, string> = {
  "Mobile Legends": "/brand/games/covers/mobile-legends.jpg",
  "Free Fire": "/brand/games/covers/free-fire.jpg",
  Roblox: "/brand/games/covers/roblox.jpg",
  "PUBG Mobile": "/brand/games/covers/pubg-mobile.jpg",
  "Genshin Impact": "/brand/games/covers/genshin-impact.jpg",
  Valorant: "/brand/games/covers/valorant.jpg",
};
const artwork: Record<string, string> = {
  "Mobile Legends": "/brand/games/mobile-legends.png", "Free Fire": "/brand/games/free-fire.png", Roblox: "/brand/games/roblox.png",
  "PUBG Mobile": "/brand/games/pubg-mobile.png", "Genshin Impact": "/brand/games/genshin-impact.png", Valorant: "/brand/products/valorant.svg",
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
};
const icons: Record<string, typeof Gamepad2> = {
  "Top up game": Gamepad2, "Booster media sosial": Users, "Aplikasi premium": AppWindow, "Format tugas": FileText, PPOB: Smartphone,
};

export function CatalogProductCard({ name, category, label = "Pilih", index = 0, onSelect }: {
  name: string; category: string; label?: string; index?: number; onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const Icon = icons[category] ?? AppWindow;
  const image = artwork[name];
  const cover = category === "Top up game" ? gameCoverArtwork[name] : undefined;
  return <motion.button type="button" tabIndex={0} className="catalog-product-card" onClick={onSelect}
    initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}
    transition={{ duration: reduce ? 0 : .35, delay: reduce ? 0 : index * .04 }}
    whileHover={reduce ? undefined : { y: -4 }} whileTap={reduce ? undefined : { scale: .99 }}>
    <span className="catalog-product-art" aria-hidden="true">{cover ? <img className="catalog-product-cover" src={cover} alt="" loading="lazy"/> : image ? <img src={image} alt="" loading="lazy"/> : <Icon size={38} strokeWidth={1.5} />}</span>
    <span className="catalog-product-content">
      {cover && image ? <span className="catalog-product-game-heading"><span className="catalog-product-game-icon" aria-hidden="true"><img src={image} alt="" loading="lazy"/></span><span className="catalog-product-game-copy"><TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/><span className="catalog-product-developer">{gameDevelopers[name]}</span></span></span> : <TextGenerateEffect as="strong" words={name} className="catalog-product-title" duration={.22} revealOnView/>}
      {cover ? null : <span className="catalog-product-category">{category}</span>}<span className="catalog-product-action">{label}<ArrowUpRight size={16}/></span>
    </span>
  </motion.button>;
}

