import { headers } from "next/headers";
import { HomeContent } from "@/components/storefront/home";
import { AccountPage } from "@/components/storefront/account-page";
import { domains } from "@/lib/domains";
export default async function Home() {
  const host = (await headers()).get("host");
  return domains.app !== domains.web && host === new URL(domains.app).host ? <AccountPage /> : <HomeContent />;
}
