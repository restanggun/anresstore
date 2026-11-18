import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { domains } from "@/lib/domains";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  const publicOrigin = [domains.web, domains.app].find(origin => new URL(origin).host === host);

  return {
    rules: { userAgent: "*", allow: "/" },
    ...(publicOrigin && { sitemap: new URL("/sitemap.xml", publicOrigin).href }),
  };
}
