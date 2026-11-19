export type Surface = "web" | "auth" | "app";
export function routeSurface(path: string): Surface {
  if (/^\/(login|daftar|lupa-password|auth)(\/|$)/.test(path)) return "auth";
  if (/^\/(dashboard|katalog|keranjang|invoice|pesanan|pembayaran|profil|misi)(\/|$)/.test(path)) return "app";
  return "web";
}
export function domainRedirect(host: string, path: string, search: string, origins: Record<Surface, string>) {
  const entries = Object.entries(origins) as [Surface, string][];
  if (new Set(entries.map(([, value]) => value)).size === 1) return null;
  const current = entries.find(([, value]) => new URL(value).host === host)?.[0];
  if (!current) return "invalid-host";
  if (path === "/" && current === "app") return null;
  if (path === "/" && current === "auth") return `${origins.auth}/login${search}`;
  const target = routeSurface(path);
  if (new URL(origins[target]).host === host) return null;
  return `${origins[target]}${path}${search}`;
}
