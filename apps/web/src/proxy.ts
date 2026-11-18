import { NextRequest, NextResponse } from "next/server";
import { domains } from "./lib/domains";
import { domainRedirect, routeSurface } from "./lib/domain-routing";
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const path = request.nextUrl.pathname;
  const destination = domainRedirect(host, path, request.nextUrl.search, domains);
  if (destination === "invalid-host") return new NextResponse("Unknown application host", { status: 421 });
  if (destination) {
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.next();
  const surface = routeSurface(path);
  const isAppHome = path === "/" && new URL(domains.app).host !== new URL(domains.web).host && host === new URL(domains.app).host;
  if (surface === "auth" || isAppHome || (surface === "app" && !/^\/katalog(?:\/|$)/.test(path)) || /^\/premium-order(?:\/|$)/.test(path)) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/|brand/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"] };
