import type { Metadata } from "next";
import { AccountPage } from "@/components/storefront/account-page";

export const metadata: Metadata = { title: "Dashboard saya | Anres Store" };
export default function DashboardPage() { return <AccountPage />; }
