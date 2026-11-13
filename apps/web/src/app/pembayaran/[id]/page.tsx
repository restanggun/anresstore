import { SandboxPaymentPage } from "@/components/storefront/payment-checkout";
export const metadata = { title: "Pembayaran sandbox | Anres Store" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SandboxPaymentPage id={id}/>;
}
