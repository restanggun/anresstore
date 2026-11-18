import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb } from "../admin/admin-store";
import { PaymentIdentityService } from "../payments/payment-identity";
import { PaymentStore } from "../payments/payment-store";
import { paymentHash } from "../payments/payment-contract";
import { CatalogController } from "./catalog.controller";

const categories = new Set(["game", "prepaid", "apps", "social", "tasks"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Controller("catalog")
export class ProductReviewsController {
  private readonly identities = new PaymentIdentityService();
  private readonly store = new PaymentStore();
  private readonly catalog = new CatalogController();

  private product(category: string, slug: string) {
    if (!categories.has(category) || !slugPattern.test(slug) || slug.length > 100)
      throw new HttpException("Produk tidak ditemukan.", 404);
  }

  private origin(req: Request) {
    const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
      .split(",").map(value => value.trim()).filter(Boolean);
    if (!req.headers.origin || !origins.includes(req.headers.origin))
      throw new HttpException("Origin tidak diizinkan.", 403);
  }

  private async limit(key: string, count: number, seconds: number) {
    const allowed = await this.store.rpc<boolean>("consume_payment_rate", {
      p_key: key, p_limit: count, p_seconds: seconds,
    });
    if (allowed !== true) throw new HttpException("Terlalu banyak ulasan dikirim. Coba lagi nanti.", 429);
  }

  @Get("reviews/:category/:slug")
  async list(@Param("category") category: string, @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response) {
    this.product(category, slug);
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    const filter = `category=eq.${encodeURIComponent(category)}&product_slug=eq.${encodeURIComponent(slug)}`;
    const [summary, rows] = await Promise.all([
      adminDb<{ review_count: number; average_rating: number }>("product_review_summaries", `?select=review_count,average_rating&${filter}&limit=1`),
      adminDb<{ id: string; rating: number; comment: string; reviewer_user_id: string | null; created_at: string }>(
        "product_reviews", `?select=id,rating,comment,reviewer_user_id,created_at&${filter}&status=eq.published&order=created_at.desc,id&limit=20`),
    ]);
    return {
      summary: summary[0] ?? { review_count: 0, average_rating: 0 },
      rows: rows.map(({ id, rating, comment, reviewer_user_id, created_at }) => ({
        id, rating, comment, author: reviewer_user_id ? "Pelanggan" : "Pengunjung", created_at,
      })),
    };
  }

  @Post("reviews")
  async submit(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    res.setHeader("Cache-Control", "no-store");
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const category = typeof input.category === "string" ? input.category : "";
    const slug = typeof input.productSlug === "string" ? input.productSlug : "";
    this.product(category, slug);
    if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5)
      throw new HttpException("Pilih rating dari 1 sampai 5 bintang.", 400);
    if (typeof input.comment !== "string" || input.comment.trim().length < 5 || input.comment.trim().length > 1000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.comment))
      throw new HttpException("Tulis komentar 5–1000 karakter.", 400);
    if (typeof input.website === "string" && input.website.trim())
      throw new HttpException("Ulasan tidak dapat dikirim.", 400);

    const identity = await this.identities.resolve(req, res);
    let email: string;
    let userId: string | null = null;
    if (identity.userId) {
      if (!identity.emailVerified || !identity.email)
        throw new HttpException("Verifikasi email akun sebelum mengirim ulasan.", 403);
      email = identity.email.trim().toLowerCase();
      userId = identity.userId;
    } else {
      const supplied = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      if (supplied.length > 254 || !emailPattern.test(supplied))
        throw new HttpException("Masukkan alamat email yang valid.", 400);
      email = supplied;
    }

    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const owner = userId ? `user:${userId}` : `email:${email}`;
    await this.limit(`product-review-ip:${paymentHash(ip)}`, 20, 3600);
    await this.limit(`product-review-owner:${paymentHash(owner)}`, 6, 86400);

    const catalog = await this.catalog.list(category);
    if (!catalog.items.some(item => item.productSlug === slug))
      throw new HttpException("Produk sudah tidak tersedia untuk diberi ulasan.", 404);

    try {
      const [review] = await this.store.request<{ id: string }[]>("product_reviews?select=id", "POST", {
        category, product_slug: slug, rating: Number(input.rating), comment: input.comment.trim(),
        reviewer_email: email, reviewer_user_id: userId, status: "pending",
      });
      if (!review?.id) throw new Error("Review insert returned no row");
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409)
        throw new HttpException("Email atau akun ini sudah mengirim ulasan untuk produk tersebut.", 409);
      throw error;
    }
    return { submitted: true, message: "Ulasan tersimpan dan menunggu peninjauan admin." };
  }
}
