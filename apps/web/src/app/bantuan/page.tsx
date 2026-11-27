import { supportSummary } from "@/lib/store-copy";
import { publicPageMetadata } from "@/lib/seo";
import { HelpContent } from "@/components/storefront/help";
export const metadata = publicPageMetadata("web", "/bantuan", "Pusat Bantuan | Anres Store", supportSummary);
export default function HelpPage(){return <HelpContent/>;}
