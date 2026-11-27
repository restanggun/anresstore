import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductReviewsController } from "../dist/catalog/product-reviews.controller.js";
import { StorefrontController } from "../dist/catalog/storefront.controller.js";

test("landing, product reviews and rating link share real but masked display names", async t => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    SUPABASE_URL: "https://reviews.example",
    SUPABASE_SECRET_KEY: "sb_secret_reviews",
    CORS_ORIGINS: "http://localhost:3000",
  });
  t.after(() => {
    for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "CORS_ORIGINS"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const userId = "30000000-0000-4000-8000-000000000011";
  const accountEmail = "dewi.private@staff.hidden.example.com";
  const guestEmail = "guest.private@example.com";
  const account = {
    reviewer_user_id: userId, reviewer_email: accountEmail,
    invoice: { payment: { customer_name: "Dewi Checkout" }, premium: null },
  };
  const identities = [
    account,
    { reviewer_user_id: null, reviewer_email: guestEmail, invoice: { payment: { customer_name: "Bima Putra" }, premium: null } },
    { reviewer_user_id: null, reviewer_email: guestEmail, invoice: { payment: null, premium: { admin_customer_name: "Sari Wulandari" } } },
    { reviewer_user_id: null, reviewer_email: guestEmail, invoice: { payment: { customer_name: guestEmail }, premium: null } },
    { reviewer_user_id: userId, reviewer_email: "x@y.io", invoice: null },
  ];
  const rows = identities.map((identity, index) => ({
    ...identity, id: String(index), rating: 5, comment: "Pesanan selesai dengan baik.",
    category: "game", product_slug: "mobile-legends", created_at: "2026-11-27T09:00:00Z",
  }));
  t.mock.method(globalThis, "fetch", async url => {
    const { pathname, searchParams } = new URL(url);
    if (pathname.endsWith("/product_reviews")) {
      if (searchParams.has("invoice_id")) return Response.json([]);
      assert.equal(searchParams.get("status"), "eq.published");
      assert.equal(searchParams.get("purchase_verified"), "eq.true");
      return Response.json(rows);
    }
    if (pathname.endsWith("/users")) return Response.json([{ id: userId, full_name: "Dewi Anggraini Putri" }]);
    if (pathname.endsWith("/storefront_landing_settings")) return Response.json([]);
    if (pathname.endsWith("/storefront_landing_public_stats")) return Response.json([{ transaction_count: 5, average_rating: 5, review_count: 5 }]);
    if (pathname.endsWith("/product_review_summaries")) return Response.json([{ review_count: 5, average_rating: 5 }]);
    if (pathname.endsWith("/consume_payment_rate")) return Response.json(true);
    if (pathname.endsWith("/invoice_review_links")) return Response.json([{ invoice_id: userId }]);
    if (pathname.endsWith("/invoices")) return Response.json([{
      ...account.invoice, invoice_number: "ANRS-QA", product_name: "Mobile Legends",
      owner_user_id: userId, claimed_user_id: null, customer_email: accountEmail,
    }]);
    throw new Error("Unexpected endpoint " + pathname);
  });
  const controller = new ProductReviewsController();
  const response = { setHeader() {} };
  const landing = await new StorefrontController().landing();
  const product = await controller.list("game", "mobile-legends", response);
  const linked = await controller.linkedReview(
    { token: "a".repeat(43) },
    { headers: { origin: "http://localhost:3000" }, ip: "127.0.0.1" },
    response,
  );
  const expected = ["Dewi A. P. (d***@s***.com)", "Bima P.", "Sari W.", "Pembeli tamu", "Dewi A. P. (***@***.io)"];
  assert.deepEqual(landing.stats.recentReviews.map(review => review.author), expected);
  assert.deepEqual(product.rows.map(review => review.author), expected);
  assert.equal(linked.author, expected[0]);
  const publicPayload = JSON.stringify({ landing, product, linked });
  for (const privateValue of [accountEmail, guestEmail, userId, "Anggraini", "Putra", "Wulandari", "reviewer_email", "customer_name"]) {
    assert.ok(!publicPayload.includes(privateValue), "Private reviewer field exposed: " + privateValue);
  }
});
