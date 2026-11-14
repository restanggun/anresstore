import type { CatalogItem } from "./catalog-mapping";

// Defaults are scoped by category and slug so admin settings can replace them later.
export const defaultProductPins: Partial<Record<CatalogItem["category"], readonly string[]>> = { game: ["mobile-legends", "free-fire", "roblox", "pubg-mobile"] };
export function productPinRank(category: CatalogItem["category"], slug: string): number | null {
  const index = (defaultProductPins[category] ?? []).indexOf(slug);
  return index < 0 ? null : index + 1;
}
