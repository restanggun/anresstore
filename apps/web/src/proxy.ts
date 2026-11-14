import { NextRequest, NextResponse } from "next/server";
import { domains } from "./lib/domains";
import { domainRedirect } from "./lib/domain-routing";
export function proxy(request: NextRequest) {
  const destination = domainRedirect(request.headers.get("host") || "", request.nextUrl.pathname, request.nextUrl.search, domains);
  if (destination === "invalid-host") return new NextResponse("Unknown application host", { status: 421 });
  if (destination) {
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/|brand/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"] };
