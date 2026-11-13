export type CatalogSource = "game" | "prepaid";
export type CatalogItem = {
  code: string; name: string; group: string; type: string; price: number;
  product: string; productSlug: string; brand: string; description: string; category: "game" | "prepaid" | "apps";
  displayName: string; section: string;
};

function text(value: unknown, max = 300): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const games = [
  ["Mobile Legends", "mobile-legends", /^(mobile legends|mobile legends bang bang)(?: [a-z]| global| indonesia| id| membership| promo| slow)?$/],
  ["Free Fire", "free-fire", /^free fire(?: [a-z]| max| global| max global| indonesia| id| promo)?$/],
  ["Roblox", "roblox", /^roblox(?: [a-z]| global| indonesia| id)?$/],
  ["PUBG Mobile", "pubg-mobile", /^(pubg mobile(?: global| indonesia| id)?|pubgm global|pubgm indo [ab])$/],
  ["Genshin Impact", "genshin-impact", /^genshin impact(?: [a-z]| global| indonesia| id)?$/],
  ["Valorant", "valorant", /^valorant(?: [a-z]| global| indonesia| id)?$/],
] as const;
// Reviewed provider groups which use the top-up destination flow. Unknown groups stay hidden.
const otherGames = [
  "AFK Journey",
  "Ace Racer",
  "Age of Empires Mobile",
  "Apex Legends Mobile",
  "Arena Breakout",
  "Arena Breakout: Infinite (PC)",
  "Arena of Valor",
  "Astral Guardians: Cyber Fantasy",
  "Be The King",
  "Blockman Go",
  "Blood Strike",
  "Call of Duty Mobile",
  "Call of Duty Mobile (Indonesia)",
  "Castle Duels",
  "Chimeraland",
  "Delta Force",
  "Delta Force (Garena)",
  "Delta Force (Steam)",
  "Dragon Nest 2 Evolution",
  "Dragon Raja",
  "Dragonheir Silent Gods",
  "Dynasty Heroes",
  "Dynasty Warriors: Overlords",
  "EA SPORTS FC Mobile",
  "Eggy Party",
  "Farlight 84",
  "Football Master 2",
  "Garena Undawn",
  "Growtopia",
  "Honkai Impact 3",
  "Honkai Star Rail",
  "Honor of Kings Global",
  "Identity V",
  "Infinite Borders",
  "King of Avalon",
  "League of Legends",
  "LifeAfter",
  "Light of Thel",
  "Light of Thel: New Era",
  "Lords Mobile",
  "Love and Deepspace",
  "Magic Chess: Go Go",
  "Magic Chess: Go Go (Global)",
  "Marvel Duel",
  "Marvel Rivals",
  "Marvel Snap",
  "Marvel Super War",
  "Metal Slug Awakening",
  "NBA Infinite (Europe)",
  "Omega Legends",
  "One Punch Man",
  "PUBG : New State Mobile",
  "Point Blank (ID)",
  "RagnaroK X Next Generation",
  "Ragnarok M Eternal Love (SEA)",
  "Ragnarok Origin",
  "Ragnarok Origin Classic",
  "Revelation Infinite Journey",
  "Rush Royale",
  "Sausage Man",
  "State of Survival: Zombie War",
  "Super Sus",
  "Tank Company",
  "Tarisland (ASIA)",
  "Tarisland (NA:EU)",
  "Tom and Jerry Chase",
  "Tower of Fantasy",
  "War Robots",
  "Watcher Of Realms",
  "Whiteout Survival",
  "Zenless Zone Zero",
  "Zepeto",
];
const extraGameAliases: Record<string, string> = { "honkai star rail": "Honkai Star Rail", "zenless zone zero zzz": "Zenless Zone Zero" };
const appGroups: Record<string, string> = {
  "alight motion": "Alight Motion",
  "amazon prime video": "Amazon Prime Video",
  "bstation premium": "Bstation",
  "canva pro": "Canva",
  "capcut pro": "CapCut",
  chatgpt: "ChatGPT",
  "disney hotstar": "Disney+",
  gemini: "Gemini",
  "getcontact premium": "Getcontact",
  "netflix premium": "Netflix",
  "perplexity ai": "Perplexity",
  "picsart pro": "PicsArt",
  "rcti plus": "RCTI+",
  "resso premium": "Resso",
  "spotify premium": "Spotify",
  "telegram premium": "Telegram",
  "tiktok music": "TikTok Music",
  "vidio premier": "Vidio",
  "vision plus": "Vision+",
  "viu premium": "Viu",
  "warp plus": "Warp+",
  "wetv premium": "WeTV",
  "youtube premium": "YouTube Premium",
  "iqiyi premium": "iQIYI",
};
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const prepaidTypes: Record<string, readonly [string, string]> = {
  pulsa: ["Pulsa", "pulsa"], "pulsa reguler": ["Pulsa", "pulsa"], "pulsa transfer": ["Pulsa", "pulsa"],
  "paket internet": ["Paket data", "paket-data"], "paket data": ["Paket data", "paket-data"], data: ["Paket data", "paket-data"],
  pln: ["Token listrik", "token-listrik"], "token pln": ["Token listrik", "token-listrik"], "pln token": ["Token listrik", "token-listrik"], "token listrik": ["Token listrik", "token-listrik"],
  "e money": ["E-wallet", "e-wallet"], emoney: ["E-wallet", "e-wallet"], "e wallet": ["E-wallet", "e-wallet"], ewallet: ["E-wallet", "e-wallet"],
  "saldo emoney": ["E-wallet", "e-wallet"],
};

export function sellingPrice(cost: number): number {
  const rate = cost < 10000 ? 1.25 : cost < 30000 ? 1.2 : cost < 60000 ? 1.15 : cost < 100000 ? 1.1 : 1.05;
  return Math.ceil(cost * rate / 100) * 100;
}

export function catalogSection(category: CatalogItem["category"], name: string, brand: string): string {
  if (category === "prepaid") return brand || "Lainnya";
  if (category === "apps") {
    const durationName = name.replace(/\[\s*garansi[^\]]*\]/gi, "").replace(/\bgaransi\b.*$/i, "");
    if (/\b(tahun|year|12\s*(bulan|month))\b/i.test(durationName)) return "Tahunan";
    if (/\b(bulan|month|[136]\s*mo)\b/i.test(durationName)) return "Bulanan";
    if (/\b(hari|day|minggu|week)\b/i.test(durationName)) return "Harian & mingguan";
    return "Pilihan lainnya";
  }
  if (/\b(member(?:ship)?|weekly|monthly|pass|starlight|twilight|blessing|welkin|langganan)\b/i.test(name)) return "Membership";
  if (/\b(diamond|diamonds)\b/i.test(name)) return "Diamond";
  if (/\b(uc)\b/i.test(name)) return "UC";
  if (/\b(crystal|crystals)\b/i.test(name)) return "Crystal";
  if (/\b(point|points|vp)\b/i.test(name)) return "Points";
  if (/\b(token|tokens|coin|coins|gold|cash|gem|gems|credit|credits)\b/i.test(name)) return "Top up";
  return "Paket lainnya";
}

// Expose only services with a known storefront flow; never guess from the service name.
export function mapCatalog(source: CatalogSource, rows: unknown[]): CatalogItem[] {
  const items = new Map<string, CatalogItem>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (text(item.status).toLowerCase() !== "available") continue;
    const code = text(item.code, 120), name = text(item.name || item.service);
    if (!code || !/^[A-Za-z0-9._-]+$/.test(code) || !name) continue;
    const rawPrice = item.price && typeof item.price === "object" ? (item.price as Record<string, unknown>).basic : item.price;
    if (typeof rawPrice !== "number" && !(typeof rawPrice === "string" && /^\d+$/.test(rawPrice))) continue;
    const cost = Number(rawPrice), price = sellingPrice(cost);
    if (!Number.isSafeInteger(cost) || cost <= 0 || !Number.isSafeInteger(price) || price <= 0) continue;
    const group = text(source === "game" ? item.game : item.brand);
    const type = text(item.type);
    let product: string, productSlug: string, category: CatalogItem["category"] = source;
    if (source === "game") {
      const app = Object.hasOwn(appGroups, normalized(group)) ? appGroups[normalized(group)] : undefined;
      if (app) { product = app; productSlug = slugify(app); category = "apps"; }
      else {
        if (/\b(joki|gift|login|vilog|password|akun|account)\b/i.test(`${group} ${name}`)) continue;
        const game = games.find(([, , pattern]) => pattern.test(normalized(group)));
        const other = (Object.hasOwn(extraGameAliases, normalized(group)) ? extraGameAliases[normalized(group)] : undefined) || otherGames.find(name => normalized(name) === normalized(group));
        if (game) [product, productSlug] = game;
        else if (other) { product = other; productSlug = slugify(other); }
        else continue;
      }
    } else {
      if (item.prepost && normalized(text(item.prepost)) !== "prepaid") continue;
      const mapping = Object.hasOwn(prepaidTypes, normalized(type)) ? prepaidTypes[normalized(type)] : undefined;
      if (!mapping) continue;
      [product, productSlug] = mapping;
    }
    if (items.has(code)) { duplicates.add(code); continue; }
    const brand = text(item.brand) || group;
    const displayName = name.replace(/\bDiamonds\b/gi, "Diamond").replace(/\s*\(\s*\d+\s*\+\s*\d+\s*(?:Bonus)?\s*\)\s*/gi, " ").trim();
    items.set(code, { code, name, displayName, section: catalogSection(category, name, brand), group, type, price, product, productSlug, category, brand, description: text(item.description || item.note, 2000) });
  }
  for (const code of duplicates) items.delete(code);
  return [...items.values()].sort((a, b) => a.product.localeCompare(b.product, "id") || a.brand.localeCompare(b.brand, "id") || a.price - b.price || a.code.localeCompare(b.code));
}
