import type { Metadata } from "next";
import "./globals.css";
import "./page-design.css";
import "./account.css";
import { Providers } from "./providers";
import { SiteShell } from "@/components/storefront/site-shell";
export const metadata: Metadata = { title: "Anres Store", description: "Jelajahi kebutuhan digital di Anres Store: top up game, aplikasi, pulsa, dan format tugas." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><a href="#main" className="sr-only focus:not-sr-only focus:block focus:p-4">Lewati ke konten</a><Providers><SiteShell>{children}</SiteShell></Providers></body></html>;
}
