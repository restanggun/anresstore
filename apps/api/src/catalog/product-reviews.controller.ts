import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { adminDb } from "../admin/admin-store";
import { PaymentIdentityService } from "../payments/payment-identity";
import { PaymentStore } from "../payments/payment-store";
import { paymentHash } from "../payments/payment-contract";
import { isReviewRating } from "./review-rating";

const categories = new Set(["game", "prepaid", "apps", "social", "tasks"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Controller("catalog")
export class ProductReviewsController {
  private readonly identities = new PaymentIdentityService();
  private readonly store = new PaymentStore();

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
        "product_reviews", `?select=id,rating,comment,reviewer_user_id,created_at&${filter}&status=eq.published&purchase_verified=eq.true&order=created_at.desc,id&limit=20`),
    ]);
    return {
      summary: summary[0] ?? { review_count: 0, average_rating: 0 },
      rows: rows.map(({ id, rating, comment, reviewer_user_id, created_at }) => ({
        id, rating, comment, author: reviewer_user_id ? "Pelanggan" : "Pengunjung", created_at,
      })),
    };
  }

  private async linkedInvoiceId(token: unknown) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpException("Tautan rating tidak valid atau sudah kedaluwarsa.", 404);
    const [link] = await adminDb<{ invoice_id: string }>("invoice_review_links",
      `?token_hash=eq.${paymentHash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=invoice_id`);
    if (!link) throw new HttpException("Tautan rating tidak valid atau sudah kedaluwarsa.", 404);
    return link.invoice_id;
  }

  @Post("reviews/link")
  async linkedReview(@Body() body: { token?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    res.setHeader("Cache-Control", "no-store");
    await this.limit(`product-review-link-ip:${paymentHash(req.ip || req.socket.remoteAddress || "unknown")}`, 60, 3600);
    const id = await this.linkedInvoiceId(body?.token);
    const [invoice, reviews] = await Promise.all([
      adminDb<{ invoice_number: string; product_name: string }>("invoices",
        `?id=eq.${id}&archived_at=is.null&payment_mode=eq.live&payment_status=eq.paid&fulfillment_status=eq.completed&select=invoice_number,product_name`),
      adminDb("product_reviews", `?invoice_id=eq.${id}&select=id`),
    ]);
    if (!invoice[0]) throw new HttpException("Invoice sudah tidak tersedia untuk rating.", 404);
    return { invoiceNumber: invoice[0].invoice_number, productName: invoice[0].product_name, submitted: reviews.length > 0 };
  }


  @Post("reviews")
  async submit(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    res.setHeader("Cache-Control", "no-store");
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    if (Object.keys(input).some(key => !["invoiceId", "reviewToken", "rating", "comment", "website"].includes(key)))
      throw new HttpException("Permintaan ulasan tidak valid.", 400);
    const invoiceId = typeof input.invoiceId === "string" && /^[a-f0-9-]{36}$/i.test(input.invoiceId) ? input.invoiceId.toLowerCase() : "";
    if (!invoiceId && input.reviewToken === undefined) throw new HttpException("Pilih invoice yang sudah selesai untuk mengirim ulasan.", 400);
    if (!isReviewRating(input.rating))
      throw new HttpException("Pilih rating 0,5 sampai 5 bintang dengan kelipatan 0,5.", 400);
    if (typeof input.comment !== "string" || input.comment.trim().length < 5 || input.comment.trim().length > 1000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.comment))
      throw new HttpException("Tulis komentar 5–1000 karakter.", 400);
    if (typeof input.website === "string" && input.website.trim())
      throw new HttpException("Ulasan tidak dapat dikirim.", 400);

    const linked = input.reviewToken !== undefined;
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    await this.limit(`product-review-ip:${paymentHash(ip)}`, 20, 3600);
    const id = linked ? await this.linkedInvoiceId(input.reviewToken) : invoiceId;
    const identity = linked ? null : await this.identities.resolve(req, res);
    const [invoice] = await this.store.request<{id:string;invoice_number:string;owner_user_id:string|null;claimed_user_id:string|null;guest_session_hash:string|null;created_at:string;category:string;product_slug:string|null;product_name:string;source_method:string;amount:number;payment_mode:string;payment_status:string;fulfillment_status:string;customer_email:string|null}[]>(
      `invoices?id=eq.${id}&archived_at=is.null&select=*&limit=1`);
    if (!invoice) throw new HttpException("Invoice tidak ditemukan atau bukan milik sesi ini.", 404);
    const accountOwner=invoice.owner_user_id??invoice.claimed_user_id;
    const age=Date.now()-Date.parse(invoice.created_at);
    const owns=accountOwner?identity?.userId===accountOwner:
      Boolean(invoice.guest_session_hash&&identity?.guestHash&&Number.isFinite(age)&&age>=-60000&&age<=30*86400000&&
        /^[a-f0-9]{64}$/.test(invoice.guest_session_hash)&&/^[a-f0-9]{64}$/.test(identity.guestHash)&&
        timingSafeEqual(Buffer.from(invoice.guest_session_hash,"hex"),Buffer.from(identity.guestHash,"hex")));
    if(!linked && !owns)throw new HttpException("Invoice tidak ditemukan atau bukan milik sesi ini.",404);
    if (invoice.payment_mode !== "live" || invoice.payment_status !== "paid" || invoice.fulfillment_status !== "completed" || invoice.amount <= 0 || !invoice.product_slug)
      throw new HttpException("Ulasan hanya tersedia untuk transaksi live yang sudah selesai.", 409);
    if (invoice.category === "tasks") {
      const [task] = await this.store.request<{ workflow_status: string }[]>(`task_order_specs?payment_id=eq.${id}&select=workflow_status&limit=1`);
      if (task ? task.workflow_status !== "completed" : invoice.source_method !== "MANUAL_QRIS") throw new HttpException("Pesanan tugas belum diselesaikan pelanggan.", 409);
    }
    const category = invoice.category;
    const slug = invoice.product_slug;
    this.product(category, slug);
    const userId = accountOwner;
    const email = typeof invoice.customer_email === "string" ? invoice.customer_email.trim().toLowerCase() : "";
    if (!email || email.length > 254) throw new HttpException("Email invoice tidak valid untuk ulasan.", 409);
    if (!linked && userId && (!identity?.emailVerified || identity.userId !== userId)) throw new HttpException("Masuk dengan akun pembeli yang sudah memverifikasi email.", 403);

    const owner = userId ? `user:${userId}` : `guest:${invoice.guest_session_hash}`;
    await this.limit(`product-review-owner:${paymentHash(owner)}`, 6, 86400);

    try {
      const [review] = linked
        ? await this.store.request<{ id: string }[]>("rpc/submit_linked_invoice_review", "POST", {
          p_token_hash: paymentHash(input.reviewToken as string), p_rating: input.rating, p_comment: input.comment.trim(),
        })
        : await this.store.request<{ id: string }[]>("product_reviews?select=id", "POST", {
        category, product_slug: slug, rating: input.rating, comment: input.comment.trim(),
        reviewer_email: email, reviewer_user_id: userId, invoice_id: id, purchase_verified: true, status: "pending",
      });
      if (!review?.id) throw new Error("Review insert returned no row");
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409)
        throw new HttpException("Ulasan untuk invoice ini sudah pernah dikirim.", 409);
      throw error;
    }
    return { submitted: true, message: "Ulasan tersimpan dan menunggu peninjauan admin." };
  }
}
