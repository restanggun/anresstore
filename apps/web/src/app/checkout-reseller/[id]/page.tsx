import { notFound } from "next/navigation";
import { ResellerHostedCheckout } from "@/components/storefront/reseller-dashboard";

export const metadata = { title: "Checkout Reseller | Anres Store", robots: { index: false } };

export default async function ResellerCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) notFound();
  return <ResellerHostedCheckout id={id}/>;
}
