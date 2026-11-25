import type { Metadata } from "next";
import { RatingPage } from "@/components/storefront/rating-page";

export const metadata: Metadata = {
  title: "Rating pesanan | Anres Store",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return <RatingPage />;
}
