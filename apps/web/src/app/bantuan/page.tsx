import { publicPageMetadata } from "@/lib/seo";
import { HelpContent } from "@/components/storefront/help";
export const metadata = publicPageMetadata("web", "/bantuan", "Pusat Bantuan | Anres Store", "Temukan panduan dan jawaban atas pertanyaan tentang katalog, akun, dan pemesanan di Anres Store.");
export default function HelpPage(){return <HelpContent/>;}
