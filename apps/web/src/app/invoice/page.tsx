import type { Metadata } from "next";
import { OrdersPage } from "@/components/storefront/orders-page";
export const metadata:Metadata={title:"Invoice | Anres Store"};
export default function Page() { return <OrdersPage/>; }
