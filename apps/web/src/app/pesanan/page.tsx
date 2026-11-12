import type { Metadata } from "next";
import { OrdersPage } from "@/components/storefront/orders-page";
export const metadata:Metadata={title:"Riwayat pesanan | Anres Store"};
export default function Page() { return <OrdersPage/>; }
