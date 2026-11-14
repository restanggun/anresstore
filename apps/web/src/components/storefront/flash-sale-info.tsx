"use client";
import { Flame } from "lucide-react";
import { money, type CatalogPromotion } from "@/lib/catalog";
import { SaleCountdown } from "./sale-countdown";

export function FlashFlame({ small = false }: { small?: boolean }) {
  return <span className={`flash-flame${small ? " flash-flame-small" : ""}`} aria-hidden="true"><Flame size={small ? 13 : 30} fill="currentColor"/><i/><i/><i/></span>;
}

type Props = { promotion: CatalogPromotion; now: number; price?: number; variant: "price" | "badge" | "summary" | "countdown" | "compact"; showCountdown?: boolean };
export function FlashSaleInfo({ promotion, now, price, variant, showCountdown = true }: Props) {
  if (variant === "countdown" || variant === "compact") return <SaleCountdown promotion={promotion} now={now} compact={variant === "compact"}/>;
  if (variant === "badge") return <span className="variant-sale-label"><FlashFlame small/>Flash sale</span>;
  if (variant === "summary") return <div className="summary-sale"><span><FlashFlame small/> Harga flash sale</span><SaleCountdown promotion={promotion} now={now} compact/></div>;
  return <span className="flash-price-info"><span className="flash-price-values"><del>{money(promotion.originalPrice)}</del><b>{money(price ?? promotion.originalPrice)}</b></span>{showCountdown && <SaleCountdown promotion={promotion} now={now} compact/>}</span>;
}
