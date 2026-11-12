import { Check, FileText } from "lucide-react";
import { categoryInfo, services } from "@/lib/storefront";

const gameProfiles = [
  { name: "Mobile Legends", src: "/brand/games/mobile-legends.png", short: "MLBB" },
  { name: "Free Fire", src: "/brand/games/free-fire.png", short: "Free Fire" },
  { name: "Roblox", src: "/brand/games/roblox.png", short: "Roblox" },
];
const socialProfiles = [
  { name: "Instagram", src: "/brand/social/instagram.svg" },
  { name: "TikTok", src: "/brand/social/tiktok.svg" },
  { name: "YouTube", src: "/brand/social/youtube.svg" },
  { name: "Facebook", src: "/brand/social/facebook.svg" },
  { name: "X", src: "/brand/social/x.svg" },
  { name: "Telegram", src: "/brand/social/telegram.svg" },
  { name: "WhatsApp", src: "/brand/social/whatsapp.svg" },
  { name: "Threads", src: "/brand/social/threads.svg" },
];

export function ServiceIllustration({ categoryName, featured = false }: { categoryName: string; featured?: boolean }) {
  const category = categoryInfo.find(item => item.name === categoryName);
  if (!category) return null;
  const items = services.filter(item => item.category === categoryName);

  return <div className={`service-art service-art-${category.art}${featured ? " service-art-featured" : ""}`} aria-hidden="true">
    <span className="service-art-halo" />
    {category.art === "game" && <div className="service-art-game-profiles">{gameProfiles.map(game=><div className="service-art-game-profile" key={game.name}><img src={game.src} alt=""/><span>{game.short}</span></div>)}</div>}
    {category.art === "document" && <div className="service-art-paper-stack"><div className="service-art-paper-back"/><div className="service-art-paper"><span>Aa</span><i/><i/><i/><b><Check size={18}/></b></div><small>Word / PPT / PDF</small></div>}
    {category.art === "social" && <div className="service-art-social-logos">{socialProfiles.map(social=><span className="service-art-social-logo" key={social.name} title={social.name}><img src={social.src} alt=""/><small>{social.name}</small></span>)}</div>}
    {category.art === "apps" && <div className="service-art-app-window"><div className="service-art-window-dots"><i/><i/><i/></div><span className="service-art-app-mark">Ca</span><div className="service-art-app-lines"><i/><i/><i/></div><small>{items[0]?.name ?? "Aplikasi"}</small></div>}
    {category.art === "ppob" && <div className="service-art-bills">{items.map((item, index) => <div className={`service-art-bill service-art-bill-${index + 1}`} key={item.name}><span>{item.code}</span><small>{item.name}</small></div>)}</div>}
  </div>;
}

