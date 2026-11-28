import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req, Res } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { CatalogController } from "../catalog/catalog.controller";
import { PaymentIdentityService } from "./payment-identity";
import { paymentHash, paymentId } from "./payment-contract";
import { PaymentStore } from "./payment-store";
import { ResellerProgram, resellerAmount, type ResellerLink, type ResellerMember } from "./reseller-program";

export async function resellerBearer(req: Request, store: PaymentStore) {
  const ip = paymentHash(req.ip || req.socket.remoteAddress || "unknown");
  if (!await store.rpc<boolean>("consume_payment_rate", { p_key: `reseller-api-ip:${ip}`, p_limit: 120, p_seconds: 60 }))
    throw new HttpException("Batas permintaan API tercapai.", 429);
  const match = /^Bearer (anrs_live_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "");
  if (!match) throw new HttpException("API key tidak valid.", 401);
  const hash = paymentHash(match[1]!);
  const [key] = await store.request<{ reseller_id: string }[]>(`reseller_keys?secret_hash=eq.${hash}&revoked_at=is.null&select=reseller_id`);
  if (!key) throw new HttpException("API key tidak valid.", 401);
  const { member, progress } = await new ResellerProgram().access(key.reseller_id, true);
  const limit = { starter: 30, pro: 60, partner: 120 }[progress.tier];
  if (!await store.rpc<boolean>("consume_payment_rate", { p_key: `reseller-api:${member.user_id}`, p_limit: limit, p_seconds: 60 }))
    throw new HttpException("Batas permintaan API tercapai.", 429);
  return { member, progress, hash };
}

@Controller("reseller")
export class ResellerController {
  private readonly program = new ResellerProgram();
  private readonly identities = new PaymentIdentityService();
  private readonly store = new PaymentStore();
  private readonly catalog = new CatalogController();

  private async verified(req: Request, res: Response, write = false) {
    res.setHeader("Cache-Control", "no-store");
    if (write) {
      const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001").split(",").map(origin => origin.trim());
      if (!origins.includes(req.headers.origin ?? "") || !req.is("application/json")) throw new HttpException("Permintaan tidak diizinkan.", 403);
    }
    const identity = await this.identities.resolve(req, res);
    if (!identity.userId) throw new HttpException("Masuk untuk melanjutkan.", 401);
    if (!identity.emailVerified) throw new HttpException("Verifikasi email akun untuk melanjutkan.", 403);
    return identity.userId;
  }

  @Get("public")
  async publicSettings(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return { registrationOpen: await this.program.registrationOpen() };
  }

  @Get("me")
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.snapshot(await this.verified(req, res));
  }

  private async snapshot(userId: string) {
    const [member, progress, registrationOpen, hostedPercent] = await Promise.all([
      this.program.member(userId), this.program.progress(userId), this.program.registrationOpen(), this.program.hostedPercent(),
    ]);
    return { member, progress, registrationOpen, hostedEnabled: hostedPercent > 0 };
  }

  @Post("applications") @HttpCode(200)
  async apply(@Body() input: { shopName?: unknown; whatsapp?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = await this.verified(req, res, true);
    const name = typeof input?.shopName === "string" ? input.shopName.trim().normalize("NFC") : "";
    const whatsapp = typeof input?.whatsapp === "string" && input.whatsapp.length <= 25 ? input.whatsapp.replace(/[ ()-]/g, "") : "";
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name) || !/^\+?[0-9]{8,15}$/.test(whatsapp))
      throw new HttpException("Isi nama toko dan nomor WhatsApp yang valid.", 400);
    if (!await this.program.registrationOpen()) throw new HttpException("Pendaftaran reseller masih ditutup.", 409);
    return this.store.rpc<ResellerMember>("submit_reseller", { p_user: userId, p_name: name, p_whatsapp: whatsapp });
  }

  @Get("missions")
  async missions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res);
    const [snapshot, [settings], claimed] = await Promise.all([
      this.snapshot(actor),
      this.store.request<{ perak_voucher_id: string | null; emas_voucher_id: string | null }[]>("reseller_settings?id=eq.1&select=perak_voucher_id,emas_voucher_id"),
      this.store.request<{ tier: string }[]>(`retail_tier_claims?user_id=eq.${actor}&select=tier`),
    ]);
    const ids = [settings?.perak_voucher_id, settings?.emas_voucher_id].filter(Boolean);
    const now = encodeURIComponent(new Date().toISOString());
    const available = ids.length ? await this.store.request<{ id: string; name: string }[]>(
      `vouchers?id=in.(${ids.join(",")})&code=is.null&account_limit=eq.1&active=eq.true&kind=neq.gift&starts_at=lte.${now}&ends_at=gt.${now}&select=id,name`) : [];
    return { ...snapshot, rewards: (["perak", "emas"] as const).map(tier => ({
      tier, voucher: available.find(row => row.id === settings?.[`${tier}_voucher_id`])?.name ?? null,
      claimed: claimed.some(row => row.tier === tier),
    })) };
  }

  @Post("missions/:tier/claim") @HttpCode(200)
  async reward(@Param("tier") tier: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res, true);
    if (tier !== "perak" && tier !== "emas") throw new HttpException("Tier tidak tersedia.", 400);
    await this.store.rpc("claim_retail_tier", { p_user: actor, p_tier: tier });
    return { ok: true };
  }

  @Get("catalog")
  async products(@Query("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    if (category !== "game" && category !== "prepaid") throw new HttpException("Kategori reseller tidak tersedia.", 400);
    const { progress } = req.headers.authorization
      ? await resellerBearer(req, this.store)
      : await this.program.access(await this.verified(req, res));
    const [catalog, prices] = await Promise.all([this.catalog.list(category), this.program.prices(category)]);
    const byCode = new Map(prices.map(row => [row.code, row]));
    return { items: catalog.items.flatMap(item => {
      const amount = resellerAmount(item, byCode.get(item.code), progress.tier);
      return amount
        ? [{ code: item.code, name: `${item.product} - ${item.name}`, retailPrice: item.price, amount, requiresZone: item.productSlug === "mobile-legends" }]
        : [];
    }) };
  }

  @Get("orders")
  async orders(@Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res);
    const offset = /^\d{1,4}$/.test(page ?? "") ? Number(page) * 25 : 0;
    const orders = await this.store.request<{ payment_id: string; channel: string; tier: string; payments: { created_at: string } }[]>(
      `reseller_orders?reseller_id=eq.${actor}&select=payment_id,channel,tier,payments!inner(created_at)&order=payments(created_at).desc,payment_id.desc&limit=25&offset=${offset}`);
    if (!orders.length) return [];
    const rows = await this.store.request<{ payment_id: string }[]>(
      `invoices?payment_id=in.(${orders.map(order => order.payment_id).join(",")})&owner_user_id=eq.${actor}&select=payment_id,invoice_number,product_name,amount,payment_status,fulfillment_status,created_at`);
    const byId = new Map(rows.map(row => [row.payment_id, row]));
    return orders.flatMap(order => byId.has(order.payment_id) ? [{ ...byId.get(order.payment_id), channel: order.channel, tier: order.tier }] : []);
  }

  @Get("checkout/:id")
  async checkout(@Param("id") id: string, @Res({ passthrough: true }) res: Response, @Req() req: Request) {
    res.setHeader("Cache-Control", "no-store");
    if (!paymentId.test(id)) throw new HttpException("Link checkout tidak ditemukan.", 404);
    const ip = paymentHash(req.ip || req.socket.remoteAddress || "unknown");
    if (!await this.store.rpc<boolean>("consume_payment_rate", { p_key: `reseller-checkout:${ip}`, p_limit: 60, p_seconds: 60 }))
      throw new HttpException("Terlalu banyak permintaan.", 429);
    const link = await this.program.checkoutLink(id);
    const catalog = await this.catalog.list(link.category);
    const item = catalog.items.find(row => row.code === link.code);
    if (!item) throw new HttpException("Produk checkout tidak tersedia.", 409);
    const offer = await this.program.hostedOffer(link, item);
    return { category: link.category, code: link.code, shopName: offer.shopName, amount: item.price,
      name: `${item.product} - ${item.name}`, requiresZone: item.productSlug === "mobile-legends" };
  }

  @Get("checkout-links")
  async checkoutLinks(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res);
    const [percent, rows] = await Promise.all([
      this.program.hostedPercent(),
      this.store.request(`reseller_checkout_status?reseller_id=eq.${actor}&select=id,code,category,expires_at,invoice_number,state,earned,payout_amount&order=created_at.desc,id.desc&limit=50`),
    ]);
    return { enabled: percent > 0, rows };
  }

  @Post("checkout-links") @HttpCode(201)
  async createCheckoutLink(@Body() body: { category?: unknown; code?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res, true);
    await this.program.access(actor, true);
    const { category, code } = body ?? {};
    if ((category !== "game" && category !== "prepaid") || typeof code !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(code))
      throw new HttpException("Produk checkout tidak valid.", 400);
    if (!await this.store.rpc<boolean>("consume_payment_rate", { p_key: `reseller-create-link:${actor}`, p_limit: 20, p_seconds: 60 }))
      throw new HttpException("Terlalu banyak link checkout dibuat. Coba sebentar lagi.", 429);
    const [catalog, price, percent] = await Promise.all([this.catalog.list(category), this.program.price(category, code), this.program.hostedPercent()]);
    const item = catalog.items.find(row => row.code === code);
    const wholesale = item ? resellerAmount(item, price, "starter") : null;
    if (!item || !wholesale || Math.floor((item.price - wholesale) * percent / 100) < 1)
      throw new HttpException("Produk ini belum tersedia untuk checkout melalui link.", 409);
    const [link] = await this.store.request<ResellerLink[]>("reseller_checkout_links?select=id,expires_at", "POST", { reseller_id: actor, category, code });
    return link;
  }

  @Get("orders/:id")
  async order(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    const { member } = await resellerBearer(req, this.store);
    if (!paymentId.test(id)) throw new HttpException("Pesanan tidak ditemukan.", 404);
    const [order] = await this.store.request<{ channel: string; tier: string }[]>(`reseller_orders?payment_id=eq.${id}&reseller_id=eq.${member.user_id}&select=channel,tier`);
    if (!order) throw new HttpException("Pesanan tidak ditemukan.", 404);
    const [invoice] = await this.store.request<unknown[]>(`invoices?payment_id=eq.${id}&owner_user_id=eq.${member.user_id}&select=payment_id,invoice_number,product_name,amount,payment_status,fulfillment_status,created_at`);
    if (!invoice) throw new HttpException("Pesanan tidak ditemukan.", 404);
    return { invoice, ...order };
  }

  @Get("keys")
  async keys(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res);
    await this.program.access(actor, true);
    return this.store.request(`reseller_keys?reseller_id=eq.${actor}&revoked_at=is.null&select=id,label,created_at&order=created_at.desc&limit=50`);
  }

  @Post("keys") @HttpCode(201)
  async issue(@Body() input: { label?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res, true);
    await this.program.access(actor, true);
    const label = typeof input?.label === "string" ? input.label.trim() : "";
    if (!label || label.length > 60 || /[\u0000-\u001f\u007f]/u.test(label)) throw new HttpException("Nama API key tidak valid.", 400);
    if (!await this.store.rpc<boolean>("consume_payment_rate", { p_key: `reseller-key-issue:${actor}`, p_limit: 5, p_seconds: 86400 }))
      throw new HttpException("Batas penerbitan API key tercapai.", 429);
    const secret = `anrs_live_${randomBytes(32).toString("base64url")}`;
    const [key] = await this.store.request<{ id: string; label: string }[]>("reseller_keys?select=id,label", "POST", {
      reseller_id: actor, label, secret_hash: paymentHash(secret),
    });
    return { ...key, secret };
  }

  @Post("keys/:id/revoke") @HttpCode(200)
  async revoke(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.verified(req, res, true);
    if (!paymentId.test(id)) throw new HttpException("API key tidak ditemukan.", 404);
    await this.store.request(`reseller_keys?id=eq.${id}&reseller_id=eq.${actor}&revoked_at=is.null`, "PATCH", { revoked_at: new Date().toISOString() });
    return { ok: true };
  }
}
