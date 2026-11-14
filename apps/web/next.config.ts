import type { NextConfig } from "next";
if (process.env.NEXT_PHASE === "phase-production-build") {
  for (const name of ["NEXT_PUBLIC_WEB_URL", "NEXT_PUBLIC_AUTH_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} wajib diisi sebelum production build.`);
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !url.hostname.endsWith(".localhost"))) throw new Error(`${name} harus URL HTTPS (HTTP .localhost hanya untuk preview lokal).`);
    if (name === "NEXT_PUBLIC_API_URL" ? url.pathname !== "/v1" : url.origin !== value) throw new Error(`${name} memiliki path tidak valid.`);
  }
}
const config: NextConfig = {
  distDir: process.env.ANRES_NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["anres.localhost", "auth.anres.localhost", "app.anres.localhost"],
  transpilePackages: ["@anres/ui", "@anres/supabase", "@anres/contracts"], poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }];
  },
};
export default config;
