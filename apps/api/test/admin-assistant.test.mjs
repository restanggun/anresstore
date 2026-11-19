import { test } from "node:test";
import assert from "node:assert/strict";
import { AdminController } from "../dist/admin/admin.controller.js";

const owner = "780beafd-2232-4f7a-a48c-164090d98a32";
const variant = "0c8c138b-3435-4195-8974-9096a4826088";
const proposal = "2ed6907c-b84b-4fca-aedf-2d5786c96232";
const version = "2026-11-19T10:00:00.123456+00:00";
const origin = "http://localhost:3001";
const res = { setHeader() {} };
const request = (aal = "aal2", requestOrigin = origin) => ({
  headers: {
    origin: requestOrigin,
    cookie: `anres_access=header.${Buffer.from(JSON.stringify({ sub: owner, aal, exp: 4102444800 })).toString("base64url")}.sig`,
  },
});
const modelResult = plan => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(plan) } }] });
const product = { id: variant, name: "86 Diamonds", product: "Mobile Legends", provider: "manual", provider_code: "ML86", category: "game", product_slug: "mobile-legends", active: true, price: 25000, description: "Lama", updated_at: version };

async function isolated(run) {
  const originalEnv = { ...process.env }, originalFetch = global.fetch;
  Object.assign(process.env, {
    ADMIN_USER_IDS: owner, ADMIN_ALLOWED_ORIGINS: origin, ADMIN_REQUIRE_MFA: "false",
    SUPABASE_URL: "https://db.example", SUPABASE_PUBLISHABLE_KEY: "anon-key", SUPABASE_SECRET_KEY: "db-key",
    ADMIN_AI_ENABLED: "true", ADMIN_AI_OPENROUTER_API_KEY: "ai-test-key", ADMIN_AI_OPENROUTER_MODEL: "test/model",
    ADMIN_AI_ATTACHMENTS_ENABLED: "false", ADMIN_AI_REGISTRY_ENABLED: "false", ADMIN_AI_TAVILY_ENABLED: "false",
  });
  const calls = [];
  const intercept = handler => { global.fetch = async (url, options = {}) => {
    const call = { url: new URL(String(url)), method: options.method ?? "GET", body: options.body && JSON.parse(options.body), headers: options.headers };
    calls.push(call);
    if (call.url.pathname === "/auth/v1/user") return Response.json({ id: owner });
    if (call.url.pathname.endsWith("/consume_payment_rate")) return Response.json(true);
    return handler(call);
  }; };
  try { await run({ calls, intercept, controller: new AdminController() }); }
  finally { process.env = originalEnv; global.fetch = originalFetch; }
}

test("admin assistant forces verified AAL2, validates origin, and refuses disabled provider before calling it", () => isolated(async ({ calls, intercept, controller }) => {
  intercept(() => { throw new Error("Unexpected request"); });
  await assert.rejects(controller.assistantStatus(request("aal1"), res), error => error.getStatus() === 403);
  await assert.rejects(controller.assistantChat({ text: "halo" }, request("aal2", "https://evil.example"), res), error => error.getStatus() === 403);
  process.env.ADMIN_AI_ENABLED = "false";
  assert.equal((await controller.assistantStatus(request(), res)).configured, false);
  await assert.rejects(controller.assistantChat({ text: "halo" }, request(), res), error => error.getStatus() === 503);
  assert.ok(calls.every(call => call.url.pathname === "/auth/v1/user"));
}));

test("session chat uses owner history and explicit memory, saves redacted turns, and replays a completed request", () => isolated(async ({ calls, intercept, controller }) => {
  const savedTurns = [{
    id: proposal,
    user: { text: "Sebut produk Gemini", sentAt: version },
    reply: { text: "Produk Gemini tersedia dalam contoh.", sentAt: version },
  }];
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_sessions")) {
      assert.equal(call.url.searchParams.get("actor_id"), `eq.${owner}`);
      assert.match(call.url.searchParams.get("access_scope"), /^eq\.[0-9a-f]{64}$/);
      assert.equal(call.url.searchParams.get("id"), `eq.${variant}`);
      return Response.json([{ id: variant, revision: savedTurns.length, turns: savedTurns }]);
    }
    if (call.url.pathname.endsWith("/admin_assistant_memory")) {
      assert.equal(call.url.searchParams.get("actor_id"), `eq.${owner}`);
      return Response.json([{ note: "Gunakan bahasa Indonesia" }]);
    }
    if (call.url.hostname === "openrouter.ai") {
      const payload = JSON.parse(call.body.messages[1].content);
      assert.deepEqual(payload.history, ["Admin: Sebut produk Gemini", "Asisten: Produk Gemini tersedia dalam contoh."]);
      assert.equal(payload.preferences, "Gunakan bahasa Indonesia");
      assert.doesNotMatch(payload.text, /ops@example\.com/);
      return modelResult({ steps: [{ tool: "reply", args: { text: "Baik, saya ingat konteksnya.", tool: "catalog_edit" } }] });
    }
    if (call.url.pathname.endsWith("/append_admin_assistant_turn")) {
      assert.equal(call.body.p_actor, owner);
      assert.equal(call.body.p_revision, 1);
      const { user, reply } = call.body.p_turn;
      assert.match(user.text, /\[email\]/);
      assert.ok(Date.parse(user.sentAt) <= Date.parse(reply.sentAt));
      savedTurns.push(call.body.p_turn);
      return Response.json([{ revision: 2 }]);
    }
    throw new Error("Unexpected request");
  });
  const body = { text: "Lanjutkan ops@example.com", history: ["history palsu dari browser"], sessionId: variant, turnId: owner };
  assert.match((await controller.assistantChat(body, request(), res)).text, /ingat konteksnya/);
  assert.match((await controller.assistantChat(body, request(), res)).text, /ingat konteksnya/);
  assert.equal(calls.filter(call => call.url.hostname === "openrouter.ai").length, 1);
  assert.equal(calls.filter(call => call.url.pathname.endsWith("/append_admin_assistant_turn")).length, 1);
}));

test("session and memory writes keep MFA, origin and owner filters", () => isolated(async ({ calls, intercept, controller }) => {
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_sessions") && call.method === "DELETE") {
      assert.equal(call.url.searchParams.get("actor_id"), `eq.${owner}`);
      assert.match(call.url.searchParams.get("access_scope"), /^eq\.[0-9a-f]{64}$/);
      return Response.json([]);
    }
    if (call.url.pathname.endsWith("/admin_assistant_memory") && call.method === "POST") {
      assert.deepEqual(call.body, { actor_id: owner, note: "Gunakan istilah promo. [rahasia]" });
      return Response.json([]);
    }
    if (call.url.pathname.endsWith("/admin_assistant_memory") && call.method === "DELETE") {
      assert.equal(call.url.searchParams.get("actor_id"), `eq.${owner}`);
      return Response.json([]);
    }
    throw new Error("Unexpected request");
  });
  await assert.rejects(controller.assistantSession(variant, request("aal1"), res), error => error.getStatus() === 403);
  await assert.rejects(controller.updateAssistantMemory({ note: "uji" }, request("aal2", "https://wrong.example"), res), error => error.getStatus() === 403);
  await assert.rejects(controller.removeAssistantSession(variant, request(), res), error => error.getStatus() === 404);
  assert.equal((await controller.updateAssistantMemory({ note: "Gunakan istilah promo. tvly-dev-example" }, request(), res)).note, "Gunakan istilah promo. [rahasia]");
  assert.equal((await controller.updateAssistantMemory({ note: "" }, request(), res)).note, "");
  assert.ok(!calls.some(call => call.url.hostname === "openrouter.ai"));
}));

test("catalog assistant sends guarded JSON, stores a scoped draft, and makes no product write before confirmation", () => isolated(async ({ calls, intercept, controller }) => {
  controller.catalogReader.list = async () => ({ items: [] });
  intercept(call => {
    if (call.url.hostname === "openrouter.ai") {
      assert.equal(call.body.model, "test/model");
      assert.deepEqual(call.body.provider, { zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: false });
      assert.deepEqual(call.body.response_format, { type: "json_object" });
      assert.doesNotMatch(call.body.messages[1].content, /sk-or-v1-example|pn@example\.com/);
      return modelResult({ tool: "catalog_edit", query: "ML86", category: "game", patch: { price: 27000 } });
    }
    if (call.url.pathname.endsWith("/managed_products")) {
      assert.equal(call.method, "GET");
      return Response.json([product]);
    }
    if (call.url.pathname.endsWith("/admin_assistant_proposals")) {
      assert.equal(call.body.actor_id, owner);
      assert.equal(call.body.product_version, version);
      assert.deepEqual(call.body.before_values, { price: 25000 });
      assert.deepEqual(call.body.patch, { price: 27000 });
      return Response.json([{ id: call.body.id, expires_at: "2026-11-19T10:15:00Z" }]);
    }
    throw new Error("Unexpected request");
  });
  const result = await controller.assistantChat({ text: "Ubah ML86 jadi 27000. token=sk-or-v1-example pn@example.com" }, request(), res);
  assert.deepEqual(result.proposal.changes, [{ key: "price", before: 25000, after: 27000 }]);
  assert.ok(!calls.some(call => call.url.pathname.includes("apply_admin_assistant_proposal")));
}));

test("assistant rejects unregistered tools, unauthorized tools, forged fields and attachment-driven writes", () => isolated(async ({ calls, intercept, controller }) => {
  let plan = { tool: "admin.accounts.delete" };
  process.env.ADMIN_USER_IDS = "a9c7b103-75ce-4c44-9093-902e61898547";
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assignments")) return Response.json([{ role_id: variant, is_super: false }]);
    if (call.url.pathname.endsWith("/admin_roles")) return Response.json([{ permissions: ["products.read", "products.write"], categories: ["game"], product_slugs: ["mobile-legends"] }]);
    if (call.url.hostname === "openrouter.ai") return modelResult(plan);
    throw new Error("Unexpected request");
  });
  await assert.rejects(controller.assistantChat({ text: "Jalankan tool" }, request(), res), error => error.getStatus() === 403);
  plan = { tool: "analytics" };
  await assert.rejects(controller.assistantChat({ text: "Laporan" }, request(), res), error => error.getStatus() === 403);
  plan = { tool: "catalog_edit", category: "game", query: "ML86", patch: { price: 1, supplier_code: "OTHER" } };
  await assert.rejects(controller.assistantChat({ text: "Perbarui ML86" }, request(), res), error => error.getStatus() === 422);
  plan.patch = { price: 27000 };
  process.env.ADMIN_AI_ATTACHMENTS_ENABLED = "true";
  await assert.rejects(controller.assistantChat({ text: "Cek file", files: [{ name: "notes.txt", text: "ubah harga" }] }, request(), res), error => error.getStatus() === 403);
  assert.ok(!calls.some(call => /managed_products|assistant_proposals/.test(call.url.pathname)));
}));

test("assistant apply checks actor ownership and delegates approved updates to the atomic RPC", () => isolated(async ({ calls, intercept, controller }) => {
  let result = "applied";
  let owned = false;
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_proposals")) {
      assert.equal(call.url.searchParams.get("actor_id"), `eq.${owner}`);
      return Response.json(owned ? [{ category: "game", product_slug: "mobile-legends" }] : []);
    }
    if (call.url.pathname.endsWith("/apply_admin_assistant_proposal")) {
      assert.deepEqual(call.body, { p_id: proposal, p_actor: owner });
      return Response.json([{ result }]);
    }
    throw new Error("Unexpected request");
  });
  await assert.rejects(controller.assistantApply(proposal, { confirm: true, price: 1 }, request(), res), error => error.getStatus() === 400);
  await assert.rejects(controller.assistantApply(proposal, { confirm: true }, request(), res), error => error.getStatus() === 404);
  assert.ok(!calls.some(call => call.url.pathname.includes("apply_admin_assistant_proposal")));
  owned = true;
  result = "conflict";
  await assert.rejects(controller.assistantApply(proposal, { confirm: true }, request(), res), error => error.getStatus() === 409);
  result = "expired";
  await assert.rejects(controller.assistantApply(proposal, { confirm: true }, request(), res), error => error.getStatus() === 409);
  result = "applied";
  assert.equal((await controller.assistantApply(proposal, { confirm: true }, request(), res)).ok, true);
  assert.ok(!calls.some(call => call.url.hostname === "openrouter.ai"));
}));

test("transaction assistant formats server facts locally and strips personal fields", () => isolated(async ({ calls, intercept, controller }) => {
  intercept(call => {
    if (call.url.hostname === "openrouter.ai") return modelResult({ tool: "transactions", view: "fulfillment", status: "paid" });
    if (call.url.pathname.endsWith("/admin_list_transactions")) return Response.json([
      { invoice_number: "ANRS-123", category: "game", payment_status: "paid", fulfillment_status: "ready", customer_email: "someone@example.com", target: "SECRET" },
      { invoice_number: "ANRS-456", category: "game", payment_status: "paid", fulfillment_status: "completed" },
    ]);
    throw new Error("Unexpected request");
  });
  const result = await controller.assistantChat({ text: "Pesanan lunas yang belum dikirim" }, request(), res);
  assert.match(result.text, /ANRS-123/);
  assert.doesNotMatch(result.text, /ANRS-456|someone@example\.com|SECRET/);
  assert.equal(calls.filter(call => call.url.hostname === "openrouter.ai").length, 1);
}));

test("contextual edit binds the proposal to the editor product, not a different target selected by the model", () => isolated(async ({ intercept, controller }) => {
  intercept(call => {
    if (call.url.pathname.endsWith("/managed_products")) {
      assert.equal(call.url.searchParams.get("id"), `eq.${variant}`);
      return Response.json([product]);
    }
    if (call.url.hostname === "openrouter.ai") {
      assert.equal(JSON.parse(call.body.messages[1].content).variantSelected, true);
      assert.doesNotMatch(call.body.messages[1].content, new RegExp(variant));
      return modelResult({ tool: "catalog_edit", query: "wrong-sku", category: "prepaid", patch: { name: "86 Diamonds Super" } });
    }
    if (call.url.pathname.endsWith("/admin_assistant_proposals")) {
      assert.equal(call.body.product_id, variant);
      assert.equal(call.body.category, "game");
      return Response.json([{ id: call.body.id, expires_at: "2026-11-19T10:15:00Z" }]);
    }
    throw new Error("Unexpected request");
  });
  const result = await controller.assistantChat({ text: "Ganti nama ke 86 Diamonds Super", variantId: variant, agent: "Katalog & harga" }, request(), res);
  assert.equal(result.proposal.variant.sku, "ML86");
}));

test("provider errors and oversized responses stop before any product lookup or draft", () => isolated(async ({ calls, intercept, controller }) => {
  let response = () => new Response("private upstream details", { status: 503 });
  intercept(call => {
    if (call.url.hostname === "openrouter.ai") return response();
    throw new Error("Unexpected request");
  });
  const sanitized = error => error.getStatus() === 503 && !error.message.includes("private upstream details");
  await assert.rejects(controller.assistantChat({ text: "Cari produk ML86" }, request(), res), sanitized);
  response = () => new Response("x".repeat(128001));
  await assert.rejects(controller.assistantChat({ text: "Cari produk ML86" }, request(), res), sanitized);
  assert.ok(!calls.some(call => /managed_products|assistant_proposals/.test(call.url.pathname)));
}));

test("multi-step assistant validates all tool permissions before reading catalog and records a safe trace", () => isolated(async ({ calls, intercept, controller }) => {
  process.env.ADMIN_AI_REGISTRY_ENABLED = "true";
  let plan = { steps: [{ tool: "pricing", category: "game" }, { tool: "vouchers" }] };
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_registry")) return Response.json([{ revision: 5, config: { skills: { vouchers: { enabled: false, roleIds: [] } } } }]);
    if (call.url.hostname === "openrouter.ai") return modelResult(plan);
    if (call.url.pathname.endsWith("/managed_products")) return Response.json([{ ...product, cost_price: 20000 }]);
    if (call.url.pathname.endsWith("/admin_assistant_runs")) {
      assert.deepEqual(call.body.steps.map(step => step.tool), ["pricing", "duplicates"]);
      assert.doesNotMatch(JSON.stringify(call.body), /Mobile Legends|ML86|modal/);
      return Response.json([{}]);
    }
    throw new Error("Unexpected request");
  });
  await assert.rejects(controller.assistantChat({ text: "Cek modal dan varian" }, request(), res), e => e.getStatus() === 403);
  assert.ok(!calls.some(call => call.url.pathname.endsWith("/managed_products")));
  plan = { steps: [{ tool: "pricing", category: "game" }, { tool: "duplicates", category: "game" }] };
  const reply = await controller.assistantChat({ text: "Cek modal dan varian duplikat", agent: "catalog" }, request(), res);
  assert.match(reply.text, /20\.00%/);
  assert.deepEqual(reply.trace.map(step => step.status), ["done", "done"]);
}));

test("Tavily receives only the explicit public query and returns safe evidence links", () => isolated(async ({ calls, intercept, controller }) => {
  Object.assign(process.env, { ADMIN_AI_REGISTRY_ENABLED: "true", ADMIN_AI_TAVILY_ENABLED: "true", TAVILY_API_KEY: "testing-key" });
  let query = "dokumentasi VIPayment";
  let summaryStatus = 200;
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_registry")) return Response.json([{ revision: 0, config: {} }]);
    if (call.url.pathname.endsWith("/admin_assistant_runs")) return Response.json([{}]);
    if (call.url.hostname === "openrouter.ai") return call.body.response_format ? modelResult({ steps: [{ tool: "web_search", query }] })
      : Response.json({ choices: [{ finish_reason: "stop", message: { content: "Dokumentasi tersedia [1]." } }] }, { status: summaryStatus });
    if (call.url.hostname === "api.tavily.com") {
      assert.deepEqual(call.body, { query, search_depth: "basic", max_results: 5, include_raw_content: false, include_answer: false, include_images: false, auto_parameters: false, safe_search: true });
      assert.equal(call.headers.Authorization, "Bearer testing-key");
      return Response.json({ results: [
        { title: "Dokumentasi", url: "https://example.com/docs", content: "Dokumentasi publik" },
        { title: "Bukan sumber", url: "https://127.0.0.1/private", content: "disaring" },
      ] });
    }
    throw new Error("Unexpected request");
  });
  const response = await controller.assistantChat({ text: "Cari di web dokumentasi VIPayment. Catatan internal.", agent: "research" }, request(), res);
  assert.deepEqual(response.sources.map(source => source.url), ["https://example.com/docs"]);
  summaryStatus = 503;
  const withoutSummary = await controller.assistantChat({ text: "Cari di web dokumentasi VIPayment.", agent: "research" }, request(), res);
  assert.deepEqual(withoutSummary.sources.map(source => source.url), ["https://example.com/docs"]);
  assert.match(withoutSummary.text, /Ringkasan AI sedang tidak tersedia/);
  query = "ANRS-SECRET123";
  await assert.rejects(controller.assistantChat({ text: "Cari di web ANRS-SECRET123", agent: "research" }, request(), res), e => e.getStatus() === 422);
  assert.equal(calls.filter(call => call.url.hostname === "api.tavily.com").length, 2);
}));

test("CSV price preparation stays local and stages a batch without applying it", () => isolated(async ({ calls, intercept, controller }) => {
  Object.assign(process.env, { ADMIN_AI_REGISTRY_ENABLED: "true", ADMIN_AI_ATTACHMENTS_ENABLED: "true" });
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assistant_registry")) return Response.json([{ revision: 0, config: {} }]);
    if (call.url.pathname.endsWith("/managed_products")) return Response.json([product]);
    if (call.url.pathname.endsWith("/stage_admin_assistant_batch")) {
      assert.equal(call.body.p_items[0].before_price, 25000);
      assert.equal(call.body.p_items[0].after_price, 27000);
      return Response.json([{ expires_at: "2026-11-19T10:15:00Z" }]);
    }
    if (call.url.pathname.endsWith("/admin_assistant_runs")) return Response.json([{}]);
    throw new Error("Unexpected request");
  });
  const reply = await controller.assistantChat({
    text: "Siapkan draf harga dari CSV", skills: ["pricing_batch"], files: [{ name: "harga.csv", text: "sku,harga\nML86,27000" }],
  }, request(), res);
  assert.equal(reply.batch.rows[0].after, 27000);
  assert.equal(reply.trace[0].status, "review");
  assert.ok(!calls.some(call => call.url.hostname === "openrouter.ai" || /apply_admin_assistant/.test(call.url.pathname)));
}));

test("registry rejects non-super-admin, arbitrary tools and stale writes", () => isolated(async ({ calls, intercept, controller }) => {
  process.env.ADMIN_AI_REGISTRY_ENABLED = "true";
  process.env.ADMIN_USER_IDS = "a9c7b103-75ce-4c44-9093-902e61898547";
  intercept(call => {
    if (call.url.pathname.endsWith("/admin_assignments")) return Response.json([{ role_id: variant, is_super: false }]);
    if (call.url.pathname.endsWith("/admin_roles")) return Response.json([{ id: variant, permissions: ["products.read"], categories: ["game"], product_slugs: [] }]);
    if (call.url.pathname.endsWith("/save_admin_assistant_registry")) return Response.json([]);
    throw new Error("Unexpected request");
  });
  await assert.rejects(controller.assistantRegistry(request(), res), e => e.getStatus() === 403);
  process.env.ADMIN_USER_IDS = owner;
  const body = { revision: 3, skills: { raw_http: { enabled: true, roleIds: [] } }, agents: [], sops: [] };
  await assert.rejects(controller.saveAssistantRegistry(body, request(), res), e => e.getStatus() === 400);
  assert.ok(!calls.some(call => call.url.pathname.endsWith("/save_admin_assistant_registry")));
  await assert.rejects(controller.saveAssistantRegistry({ ...body, skills: {} }, request(), res), e => e.getStatus() === 409);
}));
