export type CatalogSource = "game" | "prepaid" | "social";
export type CatalogItem = {
  providerCost?: number;
  code: string; name: string; group: string; type: string; price: number;
  product: string; productSlug: string; brand: string; description: string; category: "game" | "prepaid" | "apps" | "social" | "tasks";
  fulfillmentMode?: "vipayment" | "manual"; providerServiceCode?: string; serviceQuantity?: number; unitPrice?: number; minimum?: number; maximum?: number;
  taskPricing?: { unit: "page" | "slide" | "minute" | "item" | "custom"; maxUnits: number; maxRevisions: number; standardDays: number; startingPrice?: number };
  targetHosts?: readonly string[];
  targetKind?: "username" | "link" | "either";
  requiresManualReview?: boolean;
  displayName: string; section: string; developer?: string;
};

function decodeMojibake(value: string): string {
  return value
    .replace(/Ãƒâ€šÃ‚Â·/g, "·")
    .replace(/Ã‚Â·/g, "·")
    .replace(/Â·/g, "·")
    .replace(/Ãƒâ€šÃ‚Â-/g, "-")
    .replace(/Ã‚Â-/g, "-")
    .replace(/Â-/g, "-")
    .replace(/â€š/g, "")
    .replace(/Â/g, "")
    .replace(/Ã/g, "")
    .replace(/\u00a0/g, " ");
}

function text(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  const normalized = decodeMojibake(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return normalized
    .replace(/\s*(?:vippayment|vipayment|vip[- ]reseller)\s*(?:[·•]|[–—-]|Ãƒâ€šÃ‚Â·|Â·|Ã‚Â·)\s*[A-Za-z0-9._-]+(?:\s+mobile legends)?\s*$/i, "")
    .replace(/\s*(?:[·•]|[–—-])\s*[A-Za-z0-9._-]+\s+mobile legends\s*$/i, "")
    .trim();
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
  if (source === "social") return mapSocialCatalog(rows);
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
        const robloxVoucher = normalized(group) === "voucher roblox";
        if (/\b(joki|login|vilog|password|akun|account)\b/i.test(`${group} ${name}`) || (!robloxVoucher && /\bgift\b/i.test(`${group} ${name}`))) continue;
        const game = games.find(([, , pattern]) => pattern.test(normalized(group)));
        const other = (Object.hasOwn(extraGameAliases, normalized(group)) ? extraGameAliases[normalized(group)] : undefined) || otherGames.find(name => normalized(name) === normalized(group));
        if (robloxVoucher) { product = "Roblox"; productSlug = "roblox"; }
        else if (game) [product, productSlug] = game;
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
    items.set(code, { providerCost: cost, code, name, displayName, section: normalized(group) === "voucher roblox" ? "Voucher" : catalogSection(category, name, brand), group, type, price, product, productSlug, category, brand, developer: category === "game" ? text(item.developer || item.publisher) : "", description: text(item.description || item.note, 2000) });
  }
  for (const code of duplicates) items.delete(code);
  return [...items.values()].sort((a, b) => a.product.localeCompare(b.product, "id") || a.brand.localeCompare(b.brand, "id") || a.price - b.price || a.code.localeCompare(b.code));
}

const socialTargetHosts: Readonly<Record<string, readonly string[]>> = {
  Instagram: ["instagram.com"],
  TikTok: ["tiktok.com"],
  YouTube: ["youtube.com", "youtu.be"],
  Facebook: ["facebook.com", "fb.com", "fb.watch"],
  Telegram: ["t.me", "telegram.me"],
  Twitter: ["twitter.com", "x.com"],
  Spotify: ["spotify.com"],
  WhatsApp: ["whatsapp.com", "wa.me"],
  Threads: ["threads.com", "threads.net"],
};

function mapSocialCatalog(rows: unknown[]): CatalogItem[] {
  const items = new Map<string, CatalogItem>();
  const duplicate = new Set<string>();
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, any>;
    const code = text(String(row.id ?? ""), 100), name = text(row.name), group = text(row.category), cost = Number(row.price?.basic), minimum = Number(row.min), maximum = Number(row.max);
    if (row.status !== "available" || !/^[A-Za-z0-9._-]+$/.test(code) || !name || !group || !Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(maximum) || maximum < minimum) continue;
    const platform = ["Instagram","TikTok","YouTube","Facebook","Telegram","Twitter","Spotify","WhatsApp","Threads"].find(p => group.toLowerCase().includes(p.toLowerCase())) || group;
    const service = group + " " + name;
    const targetKind = platform === "Instagram" && /followers?|story|stories|live|profile visits?/i.test(group) ? "username"
      : platform === "TikTok" && /followers?/i.test(group) ? "either"
      : /likes?|views?|comments?|shares?|impressions?|saves?|subscribers?|followers?|live|members?|reactions?/i.test(service) ? "link" : "either";
    if (items.has(code)) duplicate.add(code);
    items.set(code, { code, name, displayName:name, category:"social", group, type:"social", brand:platform, product:platform, productSlug:slugify(platform), section:group, targetKind, targetHosts: Object.hasOwn(socialTargetHosts, platform) ? socialTargetHosts[platform] : undefined, price:sellingPrice(cost), providerCost:cost, providerServiceCode:code, serviceQuantity:minimum, unitPrice:cost, minimum, maximum, fulfillmentMode:"vipayment", description:text(row.note,2000) });
  }
  for (const code of duplicate) items.delete(code);
  return [...items.values()].sort((a,b)=>a.product.localeCompare(b.product)||a.price-b.price);
}
