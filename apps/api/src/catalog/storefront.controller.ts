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
    const recentReviews: Array<{ id: string; rating: number; comment: string; category: string; productSlug: string; createdAt: string; author: string }> = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const batch = await adminDb<{
        id: string; rating: number; comment: string; category: string; product_slug: string;
        created_at: string; reviewer_user_id: string | null; reviewer_email: string;
      }>("product_reviews", `?select=id,rating,comment,category,product_slug,created_at,reviewer_user_id,reviewer_email&status=eq.published&purchase_verified=eq.true&order=created_at.desc,id.asc&limit=${batchSize}&offset=${offset}`);
      const userIds = [...new Set(batch.flatMap(review => review.reviewer_user_id ? [review.reviewer_user_id] : []))];
      const users = userIds.length
        ? await adminDb<{ id: string; full_name: string }>("users", `?select=id,full_name&id=in.(${userIds.join(",")})`)
        : [];
      const names = new Map(users.map(user => [user.id, user.full_name.trim()]));
      recentReviews.push(...batch.map(review => ({
        id: review.id, rating: Number(review.rating), comment: review.comment, category: review.category,
        productSlug: review.product_slug, createdAt: review.created_at,
        author: review.reviewer_user_id === null ? "Pengunjung" : (() => {
          const [local = "", domain = ""] = review.reviewer_email.split("@");
          const maskedEmail = `${local.slice(0, 1)}***@${domain ?? ""}`;
          return `${names.get(review.reviewer_user_id) || maskedEmail} (${maskedEmail})`;
        })(),
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
