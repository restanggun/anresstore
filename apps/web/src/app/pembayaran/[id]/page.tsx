import { PaymentInvoicePage } from "@/components/storefront/payment-checkout";
export const metadata = { title: "Pembayaran | Anres Store" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentInvoicePage id={id}/>;
}
