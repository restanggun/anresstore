import { Controller, Get } from "@nestjs/common";
import { adminDb } from "../admin/admin-store";

const defaultConfig = {
  announcementEnabled: false, announcementText: "", announcementHref: "", announcementLabel: "",
  announcementMoving: false, startsAt: null as string | null, endsAt: null as string | null,
  closingTitle: "Mulai dari kebutuhanmu.", closingBody: "Temukan layanan digital yang kamu butuhkan.", showAuthCta: true,
};

@Controller("storefront")
export class StorefrontController {
  @Get("landing")
  async landing() {
    const [settings, stats] = await Promise.all([
      adminDb<{ revision: number; config: typeof defaultConfig }>("storefront_landing_settings", "?id=eq.1&select=revision,config&limit=1"),
      adminDb<{ transaction_count: number; average_rating: number; review_count: number; recent_reviews: unknown[] }>("storefront_landing_public_stats", "?select=transaction_count,average_rating,review_count,recent_reviews&limit=1"),
    ]);
    const values = stats[0];
    return {
      config: settings[0]?.config ?? defaultConfig,
      stats: values ? {
        transactionCount: Number(values.transaction_count), averageRating: Number(values.average_rating),
        reviewCount: Number(values.review_count), recentReviews: values.recent_reviews,
      } : { transactionCount: 0, averageRating: 0, reviewCount: 0, recentReviews: [] },
    };
  }
}
