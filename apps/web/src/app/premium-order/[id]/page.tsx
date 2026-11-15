import { PremiumOrderPage } from "@/components/storefront/premium-order-page";
export const metadata={title:"Pesanan aplikasi premium | Anres Store"};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PremiumOrderPage id={id}/>}
