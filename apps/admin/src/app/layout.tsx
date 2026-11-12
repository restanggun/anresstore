import type { Metadata } from "next";
import "./globals.css";
import { DashboardProvider } from "../components/dashboard-provider";
export const metadata: Metadata = { title: "Admin | Anres Store", description: "Fondasi operasional Anres Store.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><a href="#main" className="sr-only focus:not-sr-only focus:block focus:p-4">Lewati ke konten</a><DashboardProvider>{children}</DashboardProvider></body></html>;
}
