import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { OnModuleInit, OnModuleDestroy, RawBodyRequest } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { CatalogController } from "../catalog/catalog.controller";
import { verifyTripayCallback } from "./tripay-signature";
import { applyPaymentEvent, type PaymentEvent } from "./transaction-state";
import { TripayClient, TripayRejectedError, tripayConfig, tripayCustomerEmail, type TripayTransaction } from "./tripay-client";
import { writeSession } from "../auth/session";
import { InvoiceAccountService } from "./invoice-account-service";
import { invoiceCsv } from "./invoice-export";
import { PaymentStore } from "./payment-store";
import { PaymentIdentityService, type PaymentIdentity } from "./payment-identity";
import { ownsPayment, parsePayment, paymentHash, paymentId, invoiceNumber, validatePaymentDetail, type PaymentRow } from "./payment-contract";

@Controller("payments")
export class PaymentsController implements OnModuleInit, OnModuleDestroy {
  private readonly tripay = new TripayClient();
  private readonly catalog = new CatalogController();
  private readonly store = new PaymentStore();
  private readonly identities = new PaymentIdentityService();
  private readonly accounts = new InvoiceAccountService();
  private attempts = new Map<string, { count: number; until: number }>();
  private timer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  private reconciliationWarningAt = 0;

  onModuleInit() {
    if (process.env.PAYMENT_RECONCILIATION_ENABLED === "false") return;
    this.timer = setInterval(() => {
      void this.reconcile().catch(() => {
        const now = Date.now();
        if (now - this.reconciliationWarningAt < 10 * 60_000) return;
        this.reconciliationWarningAt = now;
        console.warn("payment.reconciliation_unavailable");
      });
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private ip(req: Request) { return req.ip || req.socket?.remoteAddress || "unknown"; }
  private coarseLimit(req: Request, scope: string, max: number) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const key = `${scope}:${this.ip(req)}`;
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
    if (entry.count >= max || this.attempts.size >= 10000) throw new HttpException("Terlalu banyak permintaan. Coba sebentar lagi.", 429);
    entry.count++; this.attempts.set(key, entry);
  }
  private async throttle(key: string, max: number, seconds = 60) {
    const allowed = await this.store.rpc<boolean>("consume_payment_rate", { p_key: key, p_limit: max, p_seconds: seconds });
    if (allowed !== true) throw new HttpException("Terlalu banyak permintaan pembayaran. Coba sebentar lagi.", 429);
  }
  private origin(req: Request) {
    const allowed = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001").split(",").map(value => value.trim());
    if (!req.headers.origin || !allowed.includes(req.headers.origin)) throw new HttpException("Origin tidak diizinkan.", 403);
  }
  private db(query: string, method = "GET", body?: unknown) { return this.store.request<PaymentRow[]>(`payments${query}${query.includes("payment_mode=") ? "" : `${query.includes("?") ? "&" : "?"}payment_mode=eq.${tripayConfig().mode}`}`, method, body); }
  private async row(id: string) {
    const key = paymentId.test(id.toLowerCase()) ? "id" : invoiceNumber.test(id.toUpperCase()) ? "invoice_number" : null;
    if (!key) throw new HttpException("Pembayaran tidak ditemukan.", 404);
    const [row] = await this.db(`?${key}=eq.${key === "id" ? id.toLowerCase() : id.toUpperCase()}`);
    if (!row) throw new HttpException("Pembayaran tidak ditemukan.", 404);
    return row;
  }
  private authorize(row: PaymentRow, identity: PaymentIdentity) {
    if (!ownsPayment(row, identity)) throw new HttpException("Pembayaran tidak ditemukan.", 404);
  }
  private publicPayment(row: PaymentRow, refreshDelayed = false) {
    const detail = row.details;
    return { ownership: row.owner_user_id || row.claimed_user_id ? "account" : "guest", id: row.id, invoiceNumber: row.invoice_number ?? null, source: row.source, mode: row.payment_mode, sandboxRealFulfillment: process.env.VIPAYMENT_SANDBOX_FULFILLMENT_ENABLED === "true" && process.env.VIPAYMENT_FULFILLMENT_ENABLED === "true", createdAt: row.created_at, product: row.product_name, amount: row.amount, status: row.status, target: row.target, targetZone: row.target_zone ?? null,
      method: detail?.payment_name ?? row.method, reference: row.reference,
      total: detail?.amount ?? row.amount, fee: detail?.fee_customer ?? 0,
      payCode: detail?.pay_code ?? null, checkoutUrl: detail?.checkout_url ?? null, expiresAt: detail?.expired_time ?? null,
      lastVerifiedAt: row.provider_checked_at, needsReview: row.review_required, refreshDelayed };
  }
  private async flagReview(row: PaymentRow) {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (row.review_required) return;
      const [updated] = await this.db(`?id=eq.${row.id}&revision=eq.${row.revision}`, "PATCH", { review_required: true, revision: row.revision + 1, updated_at: new Date().toISOString() });
      if (updated) return;
      row = await this.row(row.id);
    }
    throw new HttpException("Pemeriksaan transaksi belum tersimpan. Coba kembali.", 503);
  }
  private async saveDetail(initial: PaymentRow, detail: TripayTransaction): Promise<PaymentRow> {
    let row = initial;
    for (let attempt = 0; attempt < 5; attempt++) {
      try { validatePaymentDetail(row, detail); }
      catch (error) { await this.flagReview(row); throw error; }
      let status = row.status;
      if (detail.status === "UNPAID") {
        if (["creating", "unknown"].includes(status)) status = "pending";
        else if (status !== "pending") return row;
      } else {
        const transition = applyPaymentEvent({ payment: row.status, fulfillment: "not_ready" }, detail.status as PaymentEvent);
        if (transition.outcome === "review") {
          if (row.status === "refunded" && detail.status === "PAID") return row;
          await this.flagReview(row);
          throw new HttpException("Status pembayaran bertentangan; perlu pemeriksaan manual.", 409);
        }
        status = transition.state.payment;
      }
      const now = new Date().toISOString();
      const [updated] = await this.db(`?id=eq.${row.id}&revision=eq.${row.revision}`, "PATCH", {
        status, reference: detail.reference, details: detail, revision: row.revision + 1,
        provider_checked_at: now, provider_check_until: new Date(Date.now() + 30000).toISOString(), updated_at: now,
      });
      if (updated) return updated;
      // Retry with the fresh revision rather than acknowledging a lost callback update.
      row = await this.row(row.id);
    }
    throw new HttpException("Status sedang diperbarui. Coba kembali.", 503);
  }
  private async refresh(row: PaymentRow): Promise<{ row: PaymentRow; delayed: boolean }> {
    // Credentials belong to one environment. Old invoices remain readable after cutover.
    if ((row.payment_mode) !== tripayConfig().mode) return { row, delayed: true };
    if (!["pending", "unknown", "paid"].includes(row.status)) return { row, delayed: false };
    if (!await this.store.rpc<boolean>("claim_payment_check", { p_id: row.id })) return { row, delayed: false };
    try {
      const reference = row.reference ?? await this.tripay.findByMerchantRef(row.merchant_ref ?? row.id);
      if (!reference) {
        await this.db(`?id=eq.${row.id}`, "PATCH", { provider_checked_at: new Date().toISOString() });
        return { row: await this.row(row.id), delayed: true };
      }
      return { row: await this.saveDetail(row, await this.tripay.detail(reference)), delayed: false };
    }
    catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409) await this.flagReview(await this.row(row.id));
      return { row: await this.row(row.id), delayed: true };
    }
  }
  private async markUnknown(row: PaymentRow) {
    if (row.status !== "creating") return row;
    const [updated] = await this.db(`?id=eq.${row.id}&revision=eq.${row.revision}&status=eq.creating`, "PATCH", { status: "unknown", revision: row.revision + 1, updated_at: new Date().toISOString() });
    return updated ?? this.row(row.id);
  }

  @Post("session") @HttpCode(200)
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); this.origin(req); this.coarseLimit(req, "session", 60);
    await this.throttle(`session:${paymentHash(this.ip(req))}`, 30);
    return this.identities.establish(req, res);
  }
  @Get("channels")
  async channels(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); this.coarseLimit(req, "channels", 120);
    await this.throttle(`channels:${paymentHash(this.ip(req))}`, 60);
    const channels = await this.tripay.channels();
    return { mode: tripayConfig().mode, sandboxRealFulfillment: process.env.VIPAYMENT_SANDBOX_FULFILLMENT_ENABLED === "true" && process.env.VIPAYMENT_FULFILLMENT_ENABLED === "true", channels: channels.map(({ code, name, group, icon_url, minimum_amount, maximum_amount, fee_customer }) => ({ code, name, group, iconUrl: safeChannelIcon(icon_url), minimum: minimum_amount, maximum: maximum_amount, fee: fee_customer })) };
  }
  @Post("task-quote") @HttpCode(200)
  async taskQuote(@Body() input: unknown, @Req() req: Request, @Res({passthrough:true}) res: Response) {
    res.setHeader("Cache-Control","no-store"); this.origin(req); this.coarseLimit(req,"task-quote",60);
    const body=input as {code?:unknown;pages?:unknown;deadlineDays?:unknown;revisions?:unknown};
    if (!body || typeof body.code!=="string" || !/^managed\.[0-9a-f-]{36}$/.test(body.code) || !Number.isSafeInteger(body.pages) || Number(body.pages)<1 || Number(body.pages)>500 || !Number.isSafeInteger(body.deadlineDays) || Number(body.deadlineDays)<1 || Number(body.deadlineDays)>90 || !Number.isSafeInteger(body.revisions) || Number(body.revisions)<0 || Number(body.revisions)>20) throw new HttpException("Pilihan harga tugas tidak valid.",400);
    const catalog=await this.catalog.list("tasks");
    if (!catalog.items.some(item=>item.code===body.code)) throw new HttpException("Paket tugas tidak tersedia.",404);
    const amount=await this.store.rpc<number>("quote_task_order",{p_product:body.code.slice(8),p_pages:body.pages,p_days:body.deadlineDays,p_revisions:body.revisions});
    if (!Number.isSafeInteger(amount) || amount<1) throw new HttpException("Tarif tugas belum tersedia.",503);
    return {amount,catalogRevision:catalog.catalogRevision};
  }
  @Post("transactions") @HttpCode(200)
  async create(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); this.origin(req); this.coarseLimit(req, "create", 40);
    await this.throttle(`create-ip:${paymentHash(this.ip(req))}`, 20);
    const { mode } = tripayConfig();
    const body = parsePayment(input);
    if (mode === "live" && body.source === "apps") throw new HttpException("Pembayaran aplikasi premium melalui QRIS manual belum tersedia. Jangan bayar melalui Tripay.", 503);
    const identity = await this.identities.resolve(req, res);
    await this.accounts.attach(identity);
    body.email = tripayCustomerEmail(identity.userId ? identity.email ?? "" : body.email);
    const owner = identity.userId ?? identity.guestHash;
    if (!owner) throw new HttpException("Sesi checkout belum siap. Muat ulang checkout.", 401);
    await this.throttle(`create-owner:${paymentHash(owner)}`, 10);
    const requestHash = paymentHash(JSON.stringify(body));
    const [existing] = await this.db(`?id=eq.${body.id}`);
    if (existing) {
      this.authorize(existing, identity);
      if ((existing.payment_mode) !== mode) throw new HttpException("Invoice berasal dari mode pembayaran lain. Buka invoice tersebut untuk memeriksa statusnya.", 409);
      if (existing.request_hash !== requestHash) throw new HttpException("ID pembayaran sudah digunakan untuk pesanan lain.", 409);
      return this.publicPayment(existing);
    }
    const callback = process.env.TRIPAY_CALLBACK_URL?.trim();
    const returnUrl = process.env.TRIPAY_RETURN_URL?.trim();
    try {
      const parsed = new URL(callback ?? "");
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/v1/payments/callback") throw new Error();
      const redirect = new URL(returnUrl ?? "");
      if (!["http:", "https:"].includes(redirect.protocol) || redirect.username || redirect.password) throw new Error();
    } catch { throw new HttpException("Konfigurasi callback dan URL kembali belum lengkap.", 503); }
    const catalog = await this.catalog.list(body.source);
    const product = catalog.items.find(item => item.code === body.code);
    if (!product || !Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 100000000) throw new HttpException("Produk tidak tersedia. Muat ulang katalog.", 400);
    const fulfillmentMode = body.source === "tasks" || body.source === "apps" ? "manual" : product.fulfillmentMode || (body.code.startsWith("managed.") ? "manual" : "vipayment");
    if (fulfillmentMode === "vipayment") {
      if (!Number.isSafeInteger(product.providerCost) || Number(product.providerCost) <= 0) throw new HttpException("Harga supplier belum terverifikasi. Muat ulang produk.", 503);
      if ((mode === "live" || process.env.VIPAYMENT_SANDBOX_FULFILLMENT_ENABLED === "true") && (process.env.VIPAYMENT_FULFILLMENT_ENABLED !== "true" || !process.env.VIPAYMENT_API_ID?.trim() || !process.env.VIPAYMENT_API_KEY?.trim())) throw new HttpException("Pengiriman produk sedang tidak tersedia. Pembayaran belum dibuat.", 503);
    }
    const serviceQuantity = body.source === "social" ? body.expectedQuantity : product.serviceQuantity || 1;
    if (body.source === "social" && (!Number.isSafeInteger(serviceQuantity) || serviceQuantity! < (product.minimum ?? product.serviceQuantity ?? 1) || serviceQuantity! > (product.maximum ?? product.serviceQuantity ?? 1))) throw new HttpException("Jumlah item di luar batas layanan. Periksa kembali jumlah minimum dan maksimum.",400);
    if (product.productSlug === "mobile-legends" && (!/^[0-9]+$/.test(body.target) || !/^[0-9]+$/.test(body.targetZone ?? ""))) throw new HttpException("ID pemain dan server / zone Mobile Legends wajib berupa angka di kolom terpisah, tanpa tanda kurung.", 400);
    if (body.source === "tasks" && !/^managed\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.code)) throw new HttpException("Paket tugas tidak valid.",400);
    const quotedAmount = body.source === "tasks" && body.task ? await this.store.rpc<number>("quote_task_order", {p_product: body.code.replace(/^managed\./,""), p_pages:body.task.pages, p_days:body.task.deadline_days, p_revisions:body.task.revisions}) : body.source === "social" ? Math.ceil((product.unitPrice ?? product.price) * serviceQuantity! / 1000) : product.price;
    if (quotedAmount !== body.expectedAmount) throw new HttpException("Harga telah berubah. Muat ulang katalog dan periksa harga sebelum melanjutkan.", 409);
    const channel = (await this.tripay.channels()).find(item => item.code === body.method);
    if (!channel || quotedAmount < channel.minimum_amount || quotedAmount > channel.maximum_amount) throw new HttpException("Metode pembayaran tidak tersedia untuk nominal ini.", 400);
    const gatewayEmail = tripayCustomerEmail(body.email);
    const paymentSnapshot = {
      catalog_revision: catalog.catalogRevision ?? null,
      payment_mode: mode,
      invoice_product_code: product.productSlug || product.product,
      invoice_subproduct_code: product.providerServiceCode || body.code,
      id: body.id, source: body.source, provider_code: body.code, product_name: `${product.product} - ${product.name}`, target: body.target,
      target_zone: body.targetZone ?? null, provider_cost: body.source === "social" && product.providerCost ? Math.ceil(product.providerCost * serviceQuantity! / 1000) : product.providerCost ?? null,
      customer_name: body.name, customer_email: body.email, customer_phone: body.phone,
      fulfillment_mode: fulfillmentMode, provider_service_code: product.providerServiceCode || body.code, service_quantity: serviceQuantity,
      amount: quotedAmount, method: body.method, access_hash: paymentHash(randomBytes(32).toString("hex")), request_hash: requestHash,
      owner_user_id: identity.userId, guest_session_hash: identity.userId ? null : identity.guestHash,
      checkout_hash: paymentHash(JSON.stringify([mode, body.source, body.code, body.target, body.targetZone ?? "", body.expectedQuantity ?? null, body.task ?? null])),
    };
    const reservation = await this.store.rpc<{ payment: PaymentRow; claimed: boolean }>(body.source === "tasks" ? "reserve_task_payment" : "reserve_payment", body.source === "tasks" ? {p_payment:paymentSnapshot,p_task:body.task} : {p_payment:paymentSnapshot});
    if (!reservation?.payment || typeof reservation.claimed !== "boolean") throw new HttpException("Reservasi pembayaran belum dapat dipastikan.", 503);
    let row = reservation.payment;
    this.authorize(row, identity);
    if (!reservation.claimed) return this.publicPayment(row);
    try {
      const detail = await this.tripay.create({ id: row.merchant_ref ?? row.id, method: row.method, amount: row.amount, name: body.name, email: gatewayEmail, phone: body.phone, product: row.product_name, code: row.provider_code, callback: callback!, returnUrl: new URL(`/invoice/${row.invoice_number ?? row.id}`, returnUrl!).href });
      row = await this.saveDetail(row, detail);
      return this.publicPayment(row);
    } catch (error) {
      if (error instanceof TripayRejectedError) {
        const [rejected] = await this.db(`?id=eq.${row.id}&revision=eq.${row.revision}&status=eq.creating`,"PATCH",{status:"failed",revision:row.revision+1,updated_at:new Date().toISOString()});
        if (rejected) throw new HttpException(error.message,502);
      }
      // An accepted request with a lost response must never be sent again.
      row = await this.markUnknown(await this.row(row.id));
      return this.publicPayment(row, true);
    }
  }
  @Get("transactions")
  async history(@Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Query("scope") scope?: string) {
    res.setHeader("Cache-Control", "no-store"); this.coarseLimit(req, "history", 60);
    const identity = await this.identities.resolve(req, res);
    if (scope !== undefined && scope !== "account" && scope !== "guest") throw new HttpException("Jenis riwayat tidak valid.", 400);
    if (scope === "account" && !identity.userId) throw new HttpException("Silakan masuk kembali untuk melihat riwayat akun.", 401);
    const index = Number(page || 0);
    if (!Number.isSafeInteger(index) || index < 0 || index > 10000) throw new HttpException("Halaman tidak valid.", 400);
    if (!identity.userId && !identity.guestHash) return { payments: [], hasMore: false, userId: null };
    const attachedCount = scope === "guest" ? 0 : await this.accounts.attach(identity);
    if(scope === "guest" && !identity.guestHash) return {payments:[],hasMore:false,userId:identity.userId,attachedCount};
    const owner = identity.userId && scope !== "guest" ? `or=(owner_user_id.eq.${identity.userId},claimed_user_id.eq.${identity.userId})` : "owner_user_id=is.null&claimed_user_id=is.null&guest_session_hash=eq." + identity.guestHash + "&created_at=gte." + encodeURIComponent(new Date(Date.now()-30*86400000).toISOString());
    const rows = await this.db("?" + owner + "&order=created_at.desc&limit=51&offset=" + index*50);
    const visible = rows.slice(0,50).filter(row => ownsPayment(row,identity) && (identity.userId && scope !== "guest" ? row.owner_user_id===identity.userId || row.claimed_user_id===identity.userId : !row.owner_user_id && !row.claimed_user_id));
    const ids = visible.map(row=>row.id).join(",");
    const [deliveries,refunds] = visible.length ? await Promise.all([
      this.store.request<{id:string;fulfillment_status:string;provider_note:string|null;payment_mode:string}[]>(`live_transactions?id=in.(${ids})&payment_mode=eq.${tripayConfig().mode}&select=id,fulfillment_status,provider_note,payment_mode&limit=50`),
      this.store.request<{id:string;payment_id:string;refund_status:string;refund_requires_admin:boolean;refund_resolution:string|null;refund_reference:string|null}[]>(`support_conversations?payment_id=in.(${ids})&kind=eq.refund&select=id,payment_id,refund_status,refund_requires_admin,refund_resolution,refund_reference&limit=50`),
    ]) : [[],[]];
    const payments=visible.map(row=>{const delivery=deliveries.find(item=>item.id===row.id),refund=refunds.find(item=>item.payment_id===row.id);return {...this.publicPayment(row),refund:refund??null,fulfillment:delivery?{status:delivery.fulfillment_status,note:delivery.provider_note,mode:delivery.payment_mode}:null};});
    if(scope!=="guest"){
      const premiumOwner=identity.userId?`user_id=eq.${identity.userId}`:`guest_session_hash=eq.${identity.guestHash}`;
      const premiums=await this.store.request<any[]>(`premium_orders?${premiumOwner}&payment_mode=eq.live&select=id,invoice_number,product_name,amount,status,created_at,customer_email&order=created_at.desc&limit=50`);
      const mapped=premiums.map(row=>({id:row.id,invoiceNumber:row.invoice_number,createdAt:row.created_at,product:row.product_name,amount:Number(row.amount),total:Number(row.amount),method:"QRIS",status:row.status,reference:null,fulfillment:{status:row.status,mode:"manual",note:row.status==="delivered"?"Data aplikasi telah dikirim ke email.":null},ownership:identity.userId?"account":"guest"}));
      payments.push(...mapped as typeof payments);
      payments.sort((a:any,b:any)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    }
    return { payments: payments.slice(0,50), hasMore: rows.length>50||payments.length>50, userId: identity.userId, attachedCount };
  }
  @Post("guest/attach") @HttpCode(200)
  async attachGuest(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","no-store");this.origin(req);this.coarseLimit(req,"claim",20);
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId)throw new HttpException("Masuk untuk menyimpan invoice.",401);
    await this.throttle(`claim:${paymentHash(identity.userId)}`,10);
    return {attachedCount:await this.accounts.attach(identity)};
  }
  @Post("recovery/request") @HttpCode(200)
  async requestRecovery(@Body() body:{invoice?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","no-store");this.origin(req);this.coarseLimit(req,"recovery",10);
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId)throw new HttpException("Masuk dengan email checkout untuk memulihkan invoice.",401);
    await this.throttle(`recovery-ip:${paymentHash(this.ip(req))}`,10,900);
    await this.throttle(`recovery-user:${paymentHash(identity.userId)}`,3,900);
    if(!body||Object.keys(body).some(key=>key!=="invoice"))throw new HttpException("Permintaan pemulihan tidak valid.",400);
    return this.accounts.request(identity,body.invoice);
  }
  @Post("recovery/verify") @HttpCode(200)
  async verifyRecovery(@Body() body:{challengeId?:unknown;code?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","no-store");this.origin(req);this.coarseLimit(req,"recovery-check",20);
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId)throw new HttpException("Masuk untuk memulihkan invoice.",401);
    await this.throttle(`recovery-check:${paymentHash(identity.userId)}`,15,900);
    if(!body||Object.keys(body).some(key=>!["challengeId","code"].includes(key)))throw new HttpException("Permintaan pemulihan tidak valid.",400);
    return this.accounts.verify(identity,body.challengeId,body.code,data=>writeSession(req,res,data));
  }
  @Get("export.csv")
  async exportInvoices(@Req() req:Request,@Res() res:Response) {
    res.setHeader("Cache-Control","no-store");this.coarseLimit(req,"export",10);
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId)throw new HttpException("Masuk untuk mengekspor riwayat akun.",401);
    await this.throttle(`invoice-export:${paymentHash(identity.userId)}`,5,60);
    await this.accounts.attach(identity);
    const rows:PaymentRow[]=[];
    for(let offset=0;offset<=5000;offset+=1000){
      const page=await this.db(`?or=(owner_user_id.eq.${identity.userId},claimed_user_id.eq.${identity.userId})&order=created_at.desc,id.desc&limit=1000&offset=${offset}`);
      rows.push(...page.filter(row=>ownsPayment(row,identity)&&(row.owner_user_id===identity.userId||row.claimed_user_id===identity.userId)));
      if(rows.length>5000)throw new HttpException("Ekspor dibatasi 5.000 invoice per permintaan. Hubungi CS untuk riwayat lebih besar.",413);
      if(page.length<1000)break;
    }
    res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="invoice-anres-store.csv"');res.setHeader("X-Content-Type-Options","nosniff");
    res.send(invoiceCsv(rows));
  }
  @Get("transactions/:id")
  async detail(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); this.coarseLimit(req, "read", 180);
    await this.throttle(`read:${paymentHash(this.ip(req))}`, 120);
    const identity = await this.identities.resolve(req, res);
    await this.accounts.attach(identity);
    let row = await this.row(id);
    this.authorize(row, identity);
    if (row.status === "creating" && Date.parse(row.created_at) < Date.now() - 120000) row = await this.markUnknown(row);
    const refreshed = await this.refresh(row);
    const [fulfillment] = await this.store.request<{ fulfillment_status: string; provider_note: string | null; payment_mode: string }[]>("live_transactions?id=eq." + refreshed.row.id + "&select=fulfillment_status,provider_note,payment_mode");
    const [refund] = await this.store.request<{id:string;refund_status:string;refund_requires_admin:boolean;refund_resolution:string|null;refund_reference:string|null}[]>(`support_conversations?payment_id=eq.${refreshed.row.id}&kind=eq.refund&select=id,refund_status,refund_requires_admin,refund_resolution,refund_reference&limit=1`);
    return { ...this.publicPayment(refreshed.row, refreshed.delayed), refund: refund ?? null, fulfillment: fulfillment ? { status: fulfillment.fulfillment_status, note: fulfillment.provider_note, mode: fulfillment.payment_mode } : null };
  }
  @Post("transactions/:id/refund") @HttpCode(200)
  async requestRefund(@Param("id") id:string,@Body() input:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","no-store"); this.origin(req); this.coarseLimit(req,"refund",20);
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId) throw new HttpException("Masuk untuk mengajukan pengembalian melalui tiket CS. Gunakan browser yang dipakai saat memesan.",401);
    const row=await this.row(id); this.authorize(row,identity);
    await this.throttle(`refund:${paymentHash(identity.userId)}`,10);
    if(!input||typeof input!=="object"||Array.isArray(input)) throw new HttpException("Form pengembalian tidak valid.",400);
    const body=input as Record<string,unknown>;
    if(Object.keys(body).some(key=>!["reason","bank","accountName","accountNumber"].includes(key))) throw new HttpException("Form pengembalian tidak valid.",400);
    const fields=[["reason",10,1500],["bank",2,80],["accountName",2,100],["accountNumber",6,34]] as const;
    for(const [field,min,max] of fields) if(typeof body[field]!=="string"||(body[field] as string).trim().length<min||(body[field] as string).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body[field] as string)) throw new HttpException("Lengkapi alasan dan rekening pengembalian dengan benar.",400);
    if(!/^[0-9]{6,34}$/.test(body.accountNumber as string)) throw new HttpException("Nomor rekening / e-wallet harus 6?34 digit.",400);
    if(row.status!=="paid"||row.payment_mode!=="live") throw new HttpException("Pengembalian dana hanya untuk pembayaran live yang sudah lunas. Untuk invoice sandbox, hubungi CS melalui tiket bantuan.",409);
    const [ticket]=await this.store.request<{id:string}[]>("rpc/request_payment_refund","POST",{p_payment:row.id,p_user:identity.userId,p_guest_hash:identity.guestHash,p_reason:(body.reason as string).trim(),p_bank:(body.bank as string).trim(),p_account_name:(body.accountName as string).trim(),p_account_number:body.accountNumber});
    if(!ticket) throw new HttpException("Pengajuan belum dapat dipastikan. Periksa invoice sebelum mencoba kembali.",503);
    return {ticket};
  }
  @Post("callback") @HttpCode(200)
  async callback(@Req() req: RawBodyRequest<Request>) {
    this.coarseLimit(req, "callback", 300);
    const { privateKey } = tripayConfig();
    if (!verifyTripayCallback(req.rawBody!, req.headers["x-callback-signature"], privateKey)) throw new HttpException("Signature callback tidak valid.", 401);
    if (req.headers["x-callback-event"] !== "payment_status") throw new HttpException("Event callback tidak valid.", 400);
    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpException("Callback tidak valid.", 400);
    const event = body as Record<string, unknown>;
    if (typeof event.merchant_ref !== "string" || (!paymentId.test(event.merchant_ref) && !invoiceNumber.test(event.merchant_ref)) || typeof event.reference !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(event.reference) || event.is_closed_payment !== 1 || !["PAID", "FAILED", "EXPIRED", "REFUND"].includes(String(event.status)) || !Number.isSafeInteger(event.total_amount)) throw new HttpException("Callback tidak valid.", 400);
    await this.throttle(`callback:${event.merchant_ref}`, 60);
    const row = await this.row(event.merchant_ref);
    if ((row.payment_mode) !== tripayConfig().mode) throw new HttpException("Mode callback tidak sesuai invoice.", 409);
    const detail = await this.tripay.detail(event.reference);
    if (detail.amount !== event.total_amount || detail.payment_method !== event.payment_method_code) throw new HttpException("Callback tidak sesuai transaksi.", 400);
    await this.saveDetail(row, detail);
    return { success: true };
  }
  /** Replicas share polling leases. This worker never submits product orders. */
  private async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const mode = tripayConfig().mode;
      const stale = await this.db(`?payment_mode=eq.${mode}&status=eq.creating&created_at=lt.${encodeURIComponent(new Date(Date.now() - 120000).toISOString())}&limit=25`);
      for (const row of stale) await this.markUnknown(row);
      const candidates = await this.db(`?payment_mode=eq.${mode}&status=in.(pending,unknown,paid)&or=(provider_check_until.is.null,provider_check_until.lt.${encodeURIComponent(new Date().toISOString())})&order=provider_checked_at.asc.nullsfirst&limit=10`);
      for (const row of candidates) await this.refresh(row);
    } finally { this.reconciling = false; }
  }
}

function safeChannelIcon(value: string | undefined): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && (url.hostname === "tripay.co.id" || url.hostname.endsWith(".tripay.co.id")) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
