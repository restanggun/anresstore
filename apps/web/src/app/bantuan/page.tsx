import { supportSummary } from "@/lib/store-copy";
import { publicPageMetadata } from "@/lib/seo";
import { HelpContent } from "@/components/storefront/help";
import { supportInvoiceReference } from "@/lib/domains";
export const metadata = publicPageMetadata("web", "/bantuan", "Pusat Bantuan | Anres Store", supportSummary);
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ invoice?: string | string[] }> }) {
  const { invoice } = await searchParams;
  return <HelpContent invoiceReference={supportInvoiceReference(invoice)} />;
}
