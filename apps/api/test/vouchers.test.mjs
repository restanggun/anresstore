import test from "node:test";
import assert from "node:assert/strict";
import { AdminController } from "../dist/admin/admin.controller.js";
import { parsePayment } from "../dist/payments/payment-contract.js";
import { parseVoucher, parseVoucherSettings, voucherBaseAmount } from "../dist/payments/vouchers.js";
import { PaymentsController } from "../dist/payments/payments.controller.js";

const checkout = {
  id: "d4440bfe-aeb1-4239-bc38-434a58452ff6", source: "game", code: "sku", target: "123",
  method: "QRIS", name: "Buyer", email: "buyer@example.test", phone: "", expectedAmount: 5000,
};

test("voucher payload cannot forge ownership or qualify a zero-value gateway payment", () => {
  assert.deepEqual(parseVoucher({ code: " anres-test " }), { code: "ANRES-TEST" });
  assert.throws(() => parseVoucher({ code: "ANRES-TEST", userId: checkout.id }), { status: 400 });
  assert.throws(() => parsePayment({ ...checkout, expectedAmount: 0, voucher: { code: "ANRES-TEST" } }), { status: 400 });
  assert.throws(() => parsePayment({ ...checkout, method: "VOUCHER", expectedAmount: 0 }), { status: 400 });
  assert.equal(parsePayment({ ...checkout, method: "VOUCHER", expectedAmount: 0, voucher: { code: "ANRES-TEST" } }).method, "VOUCHER");
});

test("admin settings validate ranges and produce random codes for public campaigns", () => {
  const settings = { name: "Diskon QA", kind: "percent", code: "", value: 25, discount_cap: 10000,
    starts_at: "2030-02-01T10:00+07:00", ends_at: "2030-02-03T10:00+07:00",
    total_limit: 100, account_limit: 1, active: true, allow_promotion: false };
  const result = parseVoucherSettings(settings);
  assert.equal(result.starts_at, "2030-02-01T03:00:00.000Z");
  assert.match(result.code, /^ANRES-[A-F0-9]{24}$/);
  assert.notEqual(result.code, parseVoucherSettings(settings).code);
  assert.throws(() => parseVoucherSettings({ ...settings, value: 100 }), { status: 400 });
  assert.throws(() => parseVoucherSettings({ ...settings, ends_at: "2030-02-30T10:00+07:00" }), { status: 400 });
  assert.throws(() => parseVoucherSettings({ ...settings, kind: "gift", category: "social" }), { status: 400 });
  const targets = [
    { category: "game", product_slug: "mobile-legends", variant_code: "sku-1" },
    { category: "game", product_slug: "mobile-legends", variant_code: "sku-2" },
    { category: "apps", product_slug: "test-app", variant_code: null },
  ];
  assert.deepEqual(parseVoucherSettings({ ...settings, targets: [...targets, targets[0]] }).targets, targets);
  assert.throws(() => parseVoucherSettings({ ...settings, targets, category: "game" }), { status: 400 });
  assert.throws(() => parseVoucherSettings({ ...settings, targets, kind: "gift" }), { status: 400 });
  assert.throws(() => parseVoucherSettings({ ...settings, targets: [{ ...targets[0], variant_code: 12 }] }), { status: 400 });
  assert.deepEqual(parseVoucherSettings({ ...settings, targets: targets.slice(0, 2), kind: "gift" }).targets, targets.slice(0, 2));
});

test("social quote validates quantity and computes the original total from its server rate", async () => {
  const product = { code: "social-sku", price: 180000, unitPrice: 120000, minimum: 25, maximum: 1000 };
  assert.equal(await voucherBaseAmount({}, product, "social", { expectedQuantity: 25 }), 3000);
  await assert.rejects(voucherBaseAmount({}, product, "social", { expectedQuantity: 24 }), { status: 400 });
});

test("saving a voucher validates all selected categories and preserves targets from older editors", async () => {
  const controller = new AdminController();
  const targets = [
    { category: "game", product_slug: "mobile-legends", variant_code: "sku-1" },
    { category: "apps", product_slug: "test-app", variant_code: null },
  ];
  const seenCategories = [];
  const writes = [];
  controller.voucherAdmin = async () => ({ id: checkout.id });
  controller.audit = async () => {};
  controller.catalogReader.list = async category => {
    seenCategories.push(category);
    return { items: category === "game" ? [{ productSlug: "mobile-legends", code: "sku-1" }] : [{ productSlug: "test-app" }] };
  };
  controller.voucherStore.request = async (path, method, body) => {
    if (!method) return [{ targets }];
    writes.push({ path, method, body });
    return [body];
  };
  const settings = {
    id: checkout.id, version: 2, name: "Potongan", kind: "fixed", code: "ANRES-TEST", value: 1000,
    starts_at: "2030-02-01T10:00+07:00", ends_at: "2030-02-03T10:00+07:00",
    total_limit: 100, active: true, allow_promotion: false,
  };
  const saved = await controller.saveVoucher(settings, {}, {});
  assert.deepEqual(saved.voucher.targets, targets);
  assert.deepEqual(seenCategories.sort(), ["apps", "game"]);
  assert.equal(writes[0].method, "PATCH");
  assert.match(writes[0].path, /version=eq\.2$/);
  await assert.rejects(controller.saveVoucher({
    ...settings, targets: [targets[0], { ...targets[1], variant_code: "missing-sku" }],
  }, {}, {}), { status: 409 });
  assert.equal(writes.length, 1);
});

test("an account gift reserves the configured SKU and never contacts the gateway", async () => {
  const oldMode = process.env.TRIPAY_MODE;
  const oldOrigins = process.env.CORS_ORIGINS;
  process.env.TRIPAY_MODE = "live";
  process.env.CORS_ORIGINS = "http://localhost:3000";
  try {
    const buyer = "ee86d575-6b4d-4fc0-ae56-ad61778716df";
    const controller = new PaymentsController();
    controller.identities = { resolve: async () => ({ userId: buyer, email: "buyer@example.test", emailVerified: true }) };
    controller.accounts = { attach: async () => {} };
    controller.catalog = { list: async () => ({ catalogRevision: "10", items: [{
      category: "game", code: "sku", price: 5000, productSlug: "gift-game", product: "Game", name: "Item", fulfillmentMode: "manual",
    }] }) };
    controller.tripay = null;
    const calls = [];
    controller.store = {
      request: async () => [],
      rpc: async (name, args) => {
        calls.push(name);
        if (name === "consume_payment_rate") return true;
        if (name === "voucher_offer") {
          assert.equal(args.p_context.user_id, buyer);
          assert.equal(args.p_context.base_amount, 5000);
          assert.equal(args.p_context.product_slug, "gift-game");
          return { kind: "gift", amount: 0 };
        }
        assert.equal(name, "reserve_voucher_payment");
        assert.equal(args.p_payment.catalog_revision, "10");
        assert.equal(args.p_payment.amount, 0);
        assert.equal(args.p_payment.method, "VOUCHER");
        return { payment: { ...args.p_payment, status: "paid" }, claimed: true };
      },
    };
    const payment = await controller.create({ ...checkout, method: "VOUCHER", expectedAmount: 0,
      voucher: { code: "ANRES-TEST" } }, { headers: { origin: "http://localhost:3000" }, ip: "127.0.0.1" }, { setHeader() {} });
    assert.equal(payment.status, "paid");
    assert.equal(payment.total, 0);
    assert.equal(payment.checkoutUrl, null);
    assert.equal(calls[calls.length-1], "reserve_voucher_payment");
  } finally {
    if (oldMode === undefined) delete process.env.TRIPAY_MODE; else process.env.TRIPAY_MODE = oldMode;
    if (oldOrigins === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = oldOrigins;
  }
});
