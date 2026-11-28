import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { ResellerController } from "../dist/payments/reseller.controller.js";
import { resellerAmount } from "../dist/payments/reseller-program.js";

test("reseller quotes stay above supplier cost and exclude manual products", () => {
  const product = { code: "TESTSKU", providerCost: 90000, price: 120000 };
  const prices = { starter: 110000, pro: 100000, partner: 95000 };
  assert.equal(resellerAmount(product, prices, "partner"), 95000);
  assert.equal(resellerAmount({ ...product, providerCost: 95000 }, prices, "partner"), null);
  assert.equal(resellerAmount({ ...product, price: 94000 }, prices, "partner"), null);
  assert.equal(resellerAmount({ ...product, code: "managed.test" }, prices, "partner"), null);
});

test("reseller API keys are verified by hash and cannot read another reseller invoice", async t => {
  const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://reseller-db.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_mock";
  t.after(() => {
    if (original.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = original.url;
    if (original.key === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = original.key;
  });
  const seller = "11111111-1111-4111-8111-111111111111";
  const target = "22222222-2222-4222-8222-222222222222";
  const secret = "anrs_live_" + "T".repeat(43);
  const digest = createHash("sha256").update(secret).digest("hex");
  let revoked = false;
  let ownerFilter;
  let invoiceReads = 0;
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.ok(!request.href.includes(secret));
    const table = request.pathname.replace("/rest/v1/", "");
    if (table === "rpc/consume_payment_rate") return Response.json(true);
    if (table === "reseller_keys") {
      assert.equal(request.searchParams.get("secret_hash"), "eq." + digest);
      assert.equal(request.searchParams.get("revoked_at"), "is.null");
      return Response.json(revoked ? [] : [{ reseller_id: seller }]);
    }
    if (table === "resellers") return Response.json([{ user_id: seller, status: "approved" }]);
    if (table === "rpc/reseller_progress") return Response.json({ tier: "starter", activated: true });
    if (table === "reseller_orders") {
      ownerFilter = request.searchParams.get("reseller_id");
      return Response.json([]);
    }
    if (table === "invoices") invoiceReads++;
    throw new Error("Unexpected reseller query: " + table);
  });
  const req = { headers: { authorization: "Bearer " + secret }, ip: "127.0.0.1", socket: {} };
  const res = { setHeader() {} };
  const controller = new ResellerController();
  await assert.rejects(controller.order(target, req, res), error => error.getStatus() === 404);
  assert.equal(ownerFilter, "eq." + seller);
  assert.equal(invoiceReads, 0);
  revoked = true;
  await assert.rejects(controller.order(target, req, res), error => error.getStatus() === 401);
});
