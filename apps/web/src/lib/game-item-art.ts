import type { CatalogItem } from "@/lib/catalog";

/** Only return art when the game and item type are both known. */
export function gameItemArt(item: CatalogItem): string | undefined {
 const name = `${item.displayName} ${item.name}`.toLowerCase();
 const assets = "/brand/items/";
 if (item.product === "Honkai Star Rail") {
  if (/express supply pass/.test(name)) return `${assets}hsr-pass.png`;
  if (/oneiric shard/.test(name)) return `${assets}hsr-shard.png`;
 }
 if (item.product === "Call of Duty Mobile (Indonesia)" && /\bcp\b/.test(name)) return `${assets}cod-points-transparent.png`;
 if (item.product === "Genshin Impact") {
  if (/welkin/.test(name)) return `${assets}genshin-welkin.png`;
  if (/genesis|crystal/.test(name)) return `${assets}genshin-crystal.png`;
 }
 if (item.product === "Zenless Zone Zero") {
  if (/inter.knot/.test(name)) return `${assets}zzz-membership.webp`;
  if (/monochrome/.test(name)) return `${assets}zzz-monochrome.webp`;
 }
 if (item.product === "Honor of Kings Global" && /token/.test(name)) return `${assets}hok-token.webp`;
 if (item.product === "Blood Strike") {
  if (/strike pass elite plus/.test(name)) return `${assets}blood-elite-plus.webp`;
  if (/strike pass elite/.test(name)) return `${assets}blood-elite.webp`;
  if (/\bgolds?\b/.test(name)) return `${assets}blood-gold.webp`;
 }
 if (item.product === "Love and Deepspace") {
  if (/aurum pass/.test(name)) return `${assets}love-aurum.webp`;
  if (/companionship pack/.test(name)) return `${assets}love-companionship.webp`;
  if (/crystals?/.test(name)) return `${assets}love-crystal.png`;
 }
 if (item.product === "Mobile Legends") {
  if (/\bweekly diamond pass\b/.test(name)) return "/brand/items/mobile-legends/weekly-pass.png";
  if (item.section === "Diamond") return "/brand/items/mobile-legends/diamond-candidate.webp";
  return undefined;
 }
 if (item.product === "PUBG Mobile" && item.section === "UC") return "/brand/items/pubg-mobile/uc.png";
 if (item.product !== "Free Fire") return undefined;
 const base = "/brand/items/free-fire/";
 if (/\b(?:booyah pass|bp card)\b/.test(name)) return `${base}booyah-pass.png`;
 if (/\b(?:weekly|mingguan)\b/.test(name) && /\b(?:membership|member)\b/.test(name)) return `${base}weekly.png`;
 if (/\b(?:monthly|bulanan)\b/.test(name) && /\b(?:membership|member)\b/.test(name)) return `${base}monthly.png`;
 if (item.section === "Diamond") return `${base}diamond-candidate.png`;
 return undefined;
}
