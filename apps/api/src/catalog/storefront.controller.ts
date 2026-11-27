import { Controller, Get } from "@nestjs/common";
import { adminDb } from "../admin/admin-store";
import { reviewAuthorFormatter, reviewAuthorSelect, type ReviewAuthor } from "./review-author";

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
      adminDb<{ transaction_count: number; average_rating: number; review_count: number }>("storefront_landing_public_stats", "?select=transaction_count,average_rating,review_count&limit=1"),
    ]);
    const recentReviews: Array<{ id: string; rating: number; comment: string; category: string; productSlug: string; createdAt: string; author: string }> = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const batch = await adminDb<ReviewAuthor & {
        id: string; rating: number; comment: string; category: string; product_slug: string;
        created_at: string;
      }>("product_reviews", `?select=id,rating,comment,category,product_slug,created_at,${reviewAuthorSelect}&status=eq.published&purchase_verified=eq.true&order=created_at.desc,id.asc&limit=${batchSize}&offset=${offset}`);
      const displayAuthor = await reviewAuthorFormatter(batch);
      recentReviews.push(...batch.map(review => ({
        id: review.id, rating: Number(review.rating), comment: review.comment, category: review.category,
        productSlug: review.product_slug, createdAt: review.created_at,
        author: displayAuthor(review),
      })));
      if (batch.length < batchSize) break;
    }
    const values = stats[0];
    return {
      config: settings[0]?.config ?? defaultConfig,
      stats: values ? {
        transactionCount: Number(values.transaction_count), averageRating: Number(values.average_rating),
        reviewCount: Number(values.review_count), recentReviews,
      } : { transactionCount: 0, averageRating: 0, reviewCount: 0, recentReviews: [] },
    };
  }
}
