"use client";
import { Clock3 } from "lucide-react";
import type { CatalogPromotion } from "@/lib/catalog";

export function SaleCountdown({ promotion, now, compact = false }: {promotion: CatalogPromotion; now: number; compact?: boolean}) {
  const remaining = Math.max(0,Math.floor((Date.parse(promotion.endsAt)-now)/1000));
  const days = Math.floor(remaining/86400);
  const time = [Math.floor(remaining%86400/3600),Math.floor(remaining%3600/60),remaining%60].map(value=>String(value).padStart(2,"0")).join(":");
  const deadline = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(promotion.endsAt));
  return <span className={`sale-countdown${compact ? " sale-countdown-compact" : ""}`}>
    <Clock3 size={compact ? 13 : 16} aria-hidden="true"/>
    <span className="sale-countdown-copy">{compact ? "Sisa" : "Berakhir dalam"}</span>
    <time dateTime={promotion.endsAt} title={`${deadline} WIB`} aria-label={`Berakhir ${deadline} WIB`} suppressHydrationWarning>{days > 0 ? `${days} hari ` : ""}{time}</time>
  </span>;
}
