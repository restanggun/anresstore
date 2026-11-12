import { OrdersPage } from "@/components/storefront/orders-page";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <OrdersPage orderId={id}/>; }
