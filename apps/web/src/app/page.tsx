import { headers } from "next/headers";
import { HomeEntry } from "@/components/storefront/home-entry";
import { AccountPage } from "@/components/storefront/account-page";
import { domains } from "@/lib/domains";
import { publicPageMetadata, storeDescription } from "@/lib/seo";

async function isAppHome() {
  return new URL(domains.app).host !== new URL(domains.web).host &&
    (await headers()).get("host") === new URL(domains.app).host;
}

export async function generateMetadata() {
  if (await isAppHome()) return { title: "Dashboard | Anres Store" };
  return publicPageMetadata("web", "/", "Anres Store | Top Up Game, Pulsa & Aplikasi Premium", storeDescription);
}

export default async function Home() {
  return await isAppHome() ? <AccountPage /> : <HomeEntry />;
}
