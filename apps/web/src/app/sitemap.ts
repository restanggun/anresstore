import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { categorySlugs } from "@/lib/catalog";
import { domains } from "@/lib/domains";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host");
  const urls: MetadataRoute.Sitemap = [];

  if (host === new URL(domains.web).host) {
    urls.push(...["/", "/about", "/bantuan", "/reseller"].map(path => ({ url: new URL(path, domains.web).href })));
  }

  if (host === new URL(domains.app).host) {
    const catalogPaths = ["/katalog", ...Object.values(categorySlugs).map(slug => `/katalog/${slug}`)];
    urls.push(...catalogPaths.map(path => ({ url: new URL(path, domains.app).href })));
  }

  return urls;
}
