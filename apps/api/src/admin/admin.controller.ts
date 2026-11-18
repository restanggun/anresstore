import { featuredGameSlugs } from "../catalog/featured-games";
import { resolveSession, sessionAccessToken, writeSession } from "../auth/session";
import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb, type ManagedProduct } from "./admin-store";
import { CatalogController } from "../catalog/catalog.controller";
import { boundedFetch } from "../common/bounded-fetch";
import { uuid, pageIndex, messageInput } from "../help/conversations.controller";
import { premiumImage } from "../payments/premium-orders.controller";
import { qrisForAmount } from "../payments/qris-payload";
import { randomUUID } from "node:crypto";
import { TripayClient } from "../payments/tripay-client";
import { VipaymentClient } from "../payments/vipayment-client";
import { PaymentStore } from "../payments/payment-store";
import { parseVoucherSettings, voucherUuid } from "../payments/vouchers";
import nodemailer from "nodemailer";
import {
  assistantAnswer, assistantCategories, assistantConfig, assistantInput, assistantObject,
  assistantPatch, assistantPlan, assistantQuota, redactAssistantText, type AssistantTool,
} from "./assistant-model";

const assistantRupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

@Controller("admin")
export class AdminController {
  private readonly catalogReader = new CatalogController();
  private readonly voucherStore = new PaymentStore();
  private async authorize(req: Request, res: Response, write = false, requireMfa = true, forceMfa = false) {
    res.setHeader("Cache-Control", "no-store");
    const adminOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001")).split(",").map(v => v.trim()).filter(Boolean);
    if (write && !adminOrigins.includes(req.headers.origin || "")) throw new HttpException("Origin admin tidak diizinkan.", 403);
    const allowed = (process.env.ADMIN_USER_IDS || "").split(",").map(v => v.trim()).filter(Boolean);
    if (!allowed.length) throw new HttpException("Akses admin belum dikonfigurasi. Isi ADMIN_USER_IDS di server dengan UUID akun administrator.", 503);
    const { user, token } = await resolveSession(req, res);
    // The auth server has validated this exact bearer token before its claims are read.
    // Never use decoded claims as authentication without that verification.
    let claims: { aal?: unknown; sub?: unknown; exp?: unknown };
    try {
      const parts = token.split(".");
      const payload = parts[1];
      if (parts.length !== 3 || !payload || payload.length > 8192) throw new Error();
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error();
    } catch { throw new HttpException("Sesi admin tidak valid.", 401); }
    if (claims.sub !== user.id || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw new HttpException("Sesi admin tidak valid atau kedaluwarsa.", 401);
    const mfaRequired = forceMfa || process.env.NODE_ENV === "production" || process.env.ADMIN_REQUIRE_MFA !== "false";
    if (requireMfa && mfaRequired && claims.aal !== "aal2") throw new HttpException("Akses admin memerlukan verifikasi dua langkah (MFA).", 403);
    let permissions: string[] = ["*"];
    let categories: string[] = ["game", "prepaid", "apps", "social", "tasks"];
    let productSlugs: string[] = [];
    let superAdmin = allowed.includes(user.id);
    if (!superAdmin) {
      const [assignment] = await adminDb<{ role_id: string | null; is_super: boolean }>("admin_assignments", `?user_id=eq.${encodeURIComponent(user.id)}&select=role_id,is_super&limit=1`);
      if (!assignment) throw new HttpException("Akun ini tidak memiliki akses administrator.", 403);
      superAdmin = assignment.is_super === true;
      if (!superAdmin) {
        if (!assignment.role_id) throw new HttpException("Role admin tidak tersedia.", 403);
        const [role] = await adminDb<{ permissions: string[]; categories: string[]; product_slugs: string[] }>("admin_roles", `?id=eq.${encodeURIComponent(assignment.role_id)}&select=permissions,categories,product_slugs&limit=1`);
        if (!role || !Array.isArray(role.permissions) || !Array.isArray(role.categories) || !Array.isArray(role.product_slugs) || role.product_slugs.length > 50 || role.product_slugs.some(s => typeof s !== "string" || s.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) || role.categories.some(c => !["game", "prepaid", "apps", "social", "tasks"].includes(c))) throw new HttpException("Role admin tidak tersedia.", 403);
        permissions = role.permissions; categories = role.categories; productSlugs = role.product_slugs;
      }
    }
    return { id: user.id, superAdmin, permissions, categories, productSlugs };
  }

  private permit(access: { permissions: string[] }, permission: string) {
    if (!access.permissions.includes("*") && !access.permissions.includes(permission)) throw new HttpException("Izin admin tidak mencukupi.", 403);
  }
  private category(access: { categories: string[] }, category: string) {
    if (!access.categories.includes(category)) throw new HttpException("Layanan ini tidak termasuk cakupan akses.", 403);
  }
  private product(access: { productSlugs: string[] }, slug: string) {
    if (access.productSlugs.length && !access.productSlugs.includes(slug)) throw new HttpException("Sublayanan ini tidak termasuk cakupan akses.", 403);
  }
  private async audit(actorId: string, action: string, target: string) {
    // Persist the attempt before performing the operation; an outage denies the write.
    await adminDb("admin_audit_log", "", "POST", { actor_id: actorId, action, target });
  }

  private async authAdmin(path: string, method = "GET", body?: unknown) {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpException("Pengelolaan akun belum dikonfigurasi.", 503);
    const response = await boundedFetch(`${url}/auth/v1/admin/${path}`, {
      method, headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new HttpException(response.status === 404 ? "Akun tidak ditemukan." : response.status === 422 ? "Email sudah digunakan atau data akun tidak valid." : response.status === 409 ? "Akun masih memiliki data terkait dan tidak dapat dihapus." : "Layanan akun belum dapat memproses permintaan.", response.status === 404 ? 404 : response.status === 422 || response.status === 409 ? response.status : 503);
    return response.status === 204 ? {} : await response.json() as Record<string, any>;
  }

  private async mfaRequest(req: Request, path: string, body?: unknown) {
    const token = sessionAccessToken(req);
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!token || !url || !key) throw new HttpException("Sesi tidak tersedia.", 401);
    const response = await boundedFetch(`${url}/auth/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error_code?: string; code?: string };
      const code = error.error_code || error.code;
      const messages: Record<string, string> = {
        mfa_totp_enroll_not_enabled: "Pendaftaran autentikator belum diaktifkan di Supabase. Hubungi pengelola.",
        mfa_totp_verify_not_enabled: "Verifikasi autentikator belum diaktifkan di Supabase. Hubungi pengelola.",
        mfa_verification_failed: "Kode autentikator tidak cocok. Gunakan kode terbaru dari aplikasi kamu.",
        mfa_challenge_expired: "Waktu verifikasi habis. Masukkan kode terbaru lalu coba lagi.",
        mfa_factor_not_found: "Autentikator tidak ditemukan. Muat ulang halaman untuk memeriksa akun.",
        mfa_factor_name_conflict: "Penyiapan autentikator belum selesai. Coba siapkan ulang.",
      };
      const message = response.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi."
        : response.status === 401 ? "Sesi berakhir. Masuk kembali untuk melanjutkan."
        : messages[code || ""] || "Layanan autentikator belum dapat memproses permintaan. Coba lagi.";
      throw new HttpException(message, response.status >= 500 ? 503 : response.status === 401 ? 401 : response.status === 429 ? 429 : 400);
    }
    return await response.json() as Record<string, any>;
  }

  @Get("mfa")
  async mfaStatus(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, false);
    const user = await this.mfaRequest(req, "user");
    const factors = Array.isArray(user.factors) ? user.factors.filter((f: any) => f.factor_type === "totp" && f.status === "verified").map((f: any) => ({ id: f.id, name: f.friendly_name || "Authenticator" })) : [];
    const enrollment = (process.env.ADMIN_MFA_ENROLLMENT_USER_IDS || "").split(",").map(x => x.trim()).includes(access.id);
    return { factors, enrollmentAllowed: enrollment && factors.length === 0 };
  }

  @Post("mfa/enroll")
  async mfaEnroll(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, false);
    if (!(process.env.ADMIN_MFA_ENROLLMENT_USER_IDS || "").split(",").map(x => x.trim()).includes(access.id)) throw new HttpException("Pendaftaran MFA belum diizinkan oleh pengelola server.", 403);
    const user = await this.mfaRequest(req, "user");
    if (Array.isArray(user.factors) && user.factors.some((f: any) => f.status === "verified")) throw new HttpException("Akun sudah memiliki faktor MFA.", 403);
    const factor = await this.mfaRequest(req, "factors", { factor_type: "totp", friendly_name: `Admin ${Date.now()}` });
    if (typeof factor.id !== "string" || typeof factor.totp?.secret !== "string") throw new HttpException("Pendaftaran MFA tidak tersedia.", 503);
    const rawQr = factor.totp?.qr_code;
    if (typeof rawQr !== "string" || !(rawQr.startsWith("data:image/svg+xml") || /<svg(?:\s|>)/i.test(rawQr))) throw new HttpException("QR autentikator tidak tersedia. Coba lagi.", 503);
    const qrCode = rawQr.startsWith("data:image/svg+xml") ? rawQr : `data:image/svg+xml;base64,${Buffer.from(rawQr).toString("base64")}`;
    return { id: factor.id, secret: factor.totp.secret, qrCode };
  }

  @Post("mfa/challenge")
  async mfaChallenge(@Body() body: { factorId?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, false);
    if (typeof body?.factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.factorId)) throw new HttpException("Faktor tidak valid.", 400);
    const user = await this.mfaRequest(req, "user");
    const enrollment = (process.env.ADMIN_MFA_ENROLLMENT_USER_IDS || "").split(",").map(x => x.trim()).includes(access.id);
    const hasVerified = Array.isArray(user.factors) && user.factors.some((f: any) => f.status === "verified");
    if (!Array.isArray(user.factors) || !user.factors.some((f: any) => f.id === body.factorId && f.factor_type === "totp" && (f.status === "verified" || (enrollment && !hasVerified && f.status === "unverified")))) throw new HttpException("Faktor MFA tidak tersedia.", 403);
    const challenge = await this.mfaRequest(req, `factors/${body.factorId}/challenge`, {});
    if (typeof challenge.id !== "string") throw new HttpException("Challenge MFA tidak tersedia.", 503);
    return { id: challenge.id };
  }

  @Post("mfa/verify")
  async mfaVerify(@Body() body: { factorId?: unknown; challengeId?: unknown; code?: unknown; remember?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, false);
    if (body?.remember !== undefined && typeof body.remember !== "boolean") throw new HttpException("Pilihan penyimpanan sesi tidak valid.", 400);
    if (typeof body?.factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.factorId) || typeof body.challengeId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.challengeId) || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) throw new HttpException("Kode MFA tidak valid.", 400);
    const user = await this.mfaRequest(req, "user");
    const enrollment = (process.env.ADMIN_MFA_ENROLLMENT_USER_IDS || "").split(",").map(x => x.trim()).includes(access.id);
    const hasVerified = Array.isArray(user.factors) && user.factors.some((f: any) => f.status === "verified");
    if (!Array.isArray(user.factors) || !user.factors.some((f: any) => f.id === body.factorId && f.factor_type === "totp" && (f.status === "verified" || (enrollment && !hasVerified && f.status === "unverified")))) throw new HttpException("Faktor MFA tidak tersedia.", 403);
    const data = await this.mfaRequest(req, `factors/${body.factorId}/verify`, { challenge_id: body.challengeId, code: body.code });
    if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new HttpException("Sesi MFA tidak tersedia.", 503);
    writeSession(req, res, data, body.remember === undefined ? true : body.remember === true);
    return { ok: true };
  }

  @Get("eligibility")
  async eligibility(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authorize(req, res, false, false);
    return { eligible: true };
  }

  @Get("session")
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res);
    return { ...access, catalogEnabled: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Get("access")
  async accessList(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res);
    if (!access.superAdmin) throw new HttpException("Hanya super admin yang dapat mengelola akses.", 403);
    const roles = await adminDb("admin_roles", "?select=id,name,permissions,categories,product_slugs&order=name.asc&limit=100");
    const assignments = await adminDb("admin_assignments", "?select=user_id,role_id,is_super&limit=500");
    const audit = await adminDb("admin_audit_log", "?select=actor_id,action,target,created_at&order=created_at.desc&limit=50");
    return { roles, assignments, audit };
  }

  @Get("accounts")
  async accounts(@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res);
    if(!access.superAdmin) throw new HttpException("Hanya super admin yang dapat melihat akun.",403);
    const index=Number(page||1);
    if(!Number.isSafeInteger(index)||index<1||index>10000) throw new HttpException("Halaman tidak valid.",400);
    const data=await this.authAdmin(`users?page=${index}&per_page=50`);
    return {users:(Array.isArray(data.users)?data.users:[]).map((user:any)=>({id:user.id,email:user.email||"",confirmed:!!user.email_confirmed_at,created_at:user.created_at})),page:index,hasMore:Array.isArray(data.users)&&data.users.length===50};
  }

  @Post("accounts")
  async createAccount(@Body() input:{email?:unknown;password?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    if(!access.superAdmin) throw new HttpException("Hanya super admin yang dapat membuat akun.",403);
    if(typeof input?.email!=="string"||input.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())||typeof input.password!=="string"||input.password.length<8||input.password.length>256) throw new HttpException("Isi email dan password minimal 8 karakter.",400);
    const email=input.email.trim().toLowerCase();
    await this.audit(access.id,"account.create",email);
    const user=await this.authAdmin("users","POST",{email,password:input.password,email_confirm:true});
    return {id:user.id,email:user.email||email};
  }

  @Patch("accounts/:id")
  async updateAccount(@Param("id") id:string,@Body() input:{email?:unknown;password?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    if(!access.superAdmin) throw new HttpException("Hanya super admin yang dapat mengubah akun.",403);
    if(!uuid(id)||!input||Object.keys(input).some(key=>!["email","password"].includes(key))||(!input.email&&!input.password)||input.email!==undefined&&(typeof input.email!=="string"||input.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))||input.password!==undefined&&(typeof input.password!=="string"||input.password.length<8||input.password.length>256)) throw new HttpException("Email atau password tidak valid.",400);
    await this.audit(access.id,"account.update",id);
    const user=await this.authAdmin(`users/${id}`,"PUT",{...(typeof input.email==="string"?{email:input.email.trim().toLowerCase()}:{}),...(typeof input.password==="string"?{password:input.password}:{})});
    return {id,email:user.email||""};
  }

  @Delete("accounts/:id")
  async removeAccount(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    if(!access.superAdmin) throw new HttpException("Hanya super admin yang dapat menghapus akun.",403);
    if(!uuid(id)) throw new HttpException("Akun tidak valid.",400);
    if(id===access.id||(process.env.ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).includes(id)) throw new HttpException("Akun super admin tidak dapat dihapus.",403);
    const [assignment]=await adminDb("admin_assignments",`?user_id=eq.${id}&select=user_id&limit=1`);
    if(assignment) throw new HttpException("Cabut akses admin akun ini sebelum menghapusnya.",409);
    for(const [table,column] of [["payments","owner_user_id"],["payments","claimed_user_id"],["live_transactions","user_id"],["orders","user_id"],["support_conversations","user_id"]] as const) {
      if((await adminDb(table,`?${column}=eq.${id}&select=id&limit=1`)).length) throw new HttpException("Akun memiliki riwayat transaksi atau bantuan dan tidak dapat dihapus.",409);
    }
    await this.audit(access.id,"account.delete",id);
    await this.authAdmin(`users/${id}`,"DELETE");
    return {ok:true};
  }

  @Post("roles")
  async saveRole(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    if (!access.superAdmin) throw new HttpException("Hanya super admin yang dapat mengelola role.", 403);
    const body = input as { id?: unknown; name?: unknown; permissions?: unknown; categories?: unknown; product_slugs?: unknown };
    const allowedPermissions = ["orders.read", "orders.write", "payments.read", "support.read", "support.write", "customers.read", "customers.write", "products.read", "products.write"];
    const categories = ["game", "prepaid", "apps", "social", "tasks"];
    if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
      typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 || /[<>\u0000-\u001f]/.test(body.name) ||
      !Array.isArray(body.permissions) || body.permissions.some(p => typeof p !== "string" || !allowedPermissions.includes(p)) ||
      !Array.isArray(body.categories) || body.categories.some(c => typeof c !== "string" || !categories.includes(c)) ||
      !Array.isArray(body.product_slugs) || body.product_slugs.length > 50 || body.product_slugs.some(s => typeof s !== "string" || s.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) throw new HttpException("Role atau izin tidak valid.", 400);
    await this.audit(access.id, "role.save", body.id);
    const [role] = await adminDb("admin_roles", "?on_conflict=id", "POST", { id: body.id, name: body.name.trim(), permissions: [...new Set(body.permissions)], categories: [...new Set(body.categories)], product_slugs: [...new Set(body.product_slugs)] });
    return { role };
  }

  @Post("assignments")
  async assignRole(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    if (!access.superAdmin) throw new HttpException("Hanya super admin yang dapat mengelola administrator.", 403);
    const body = input as { userId?: unknown; roleId?: unknown; superAdmin?: unknown };
    const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (!body || !uuid(body.userId) || (body.roleId !== null && !uuid(body.roleId)) || typeof body.superAdmin !== "boolean" || (body.superAdmin && body.roleId !== null)) throw new HttpException("Akun atau role tidak valid.", 400);
    await this.audit(access.id, body.superAdmin ? "administrator.grant_super" : body.roleId === null ? "administrator.revoke" : "administrator.assign", body.userId);
    if (body.roleId === null && !body.superAdmin) {
      await adminDb("admin_assignments", `?user_id=eq.${encodeURIComponent(body.userId)}`, "DELETE");
      return { ok: true };
    }
    if (!body.superAdmin && body.roleId) {
      const [role] = await adminDb("admin_roles", `?id=eq.${encodeURIComponent(body.roleId)}&select=id&limit=1`);
      if (!role) throw new HttpException("Role tidak ditemukan.", 400);
    }
    await adminDb("admin_assignments", "?on_conflict=user_id", "POST", { user_id: body.userId, role_id: body.roleId, is_super: body.superAdmin });
    return { ok: true };
  }

  @Patch("conversations/:id/refund")
  async reviewRefund(@Param("id") id:string,@Body() body:{status?:unknown;resolution?:unknown;reference?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    // All refunds are manual until Tripay documents an initiation API. Only full admins may attest a payout.
    if(!access.superAdmin) throw new HttpException("Pengembalian dana harus ditangani administrator utama, termasuk transaksi di atas Rp50.000.",403);
    if(!uuid(id)||!body||!["in_review","completed","rejected"].includes(String(body.status))||typeof body.resolution!=="string"||body.resolution.trim().length<10||body.resolution.length>1000||body.reference!==undefined&&(typeof body.reference!=="string"||body.reference.length>160)) throw new HttpException("Isi status, catatan pemeriksaan, dan referensi transfer yang valid.",400);
    if(body.status==="completed"&&(typeof body.reference!=="string"||body.reference.trim().length<6)) throw new HttpException("Referensi transfer wajib diisi setelah transfer benar-benar selesai.",400);
    await this.audit(access.id,"refund."+body.status,id);
    const [room]=await adminDb("rpc/review_payment_refund","","POST",{p_room:id,p_actor:access.id,p_status:body.status,p_resolution:body.resolution.trim(),p_reference:typeof body.reference==="string"?body.reference.trim():null});
    if(!room) throw new HttpException("Pengajuan tidak ditemukan.",404);
    return room;
  }

  @Get("records/:kind")
  async records(@Param("kind") kind: string, @Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Query("mode") mode?: string, @Query("category") category?: string) {
    const access = await this.authorize(req, res);
    const tables: Record<string, [string, string]> = {
      orders: ["live_transactions", "id,invoice_number,user_id,created_at,product_name,amount,payment_method,payment_status,fulfillment_status"],
      payments: ["payments", "id,invoice_number,created_at,source,product_name,provider_code,target,amount,method,reference,status"],
      historical: ["historical_sales", "id,import_key,sale_date,payment_method,amount,product_name,variant_description,quantity,source,created_at"],
      fulfillment: ["live_transactions", "id,invoice_number,created_at,updated_at,category,product_name,provider_code,target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,provider_reference,provider_note,payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone"],
      support: ["support_requests", "id,created_at,name,email,message,status"],
      products: ["managed_products", "*"],
      customers: ["users", "id,full_name,created_at,updated_at"],
      conversations: ["support_conversations", "*"],
    };
    const table = tables[kind];
    if (!table) throw new HttpException("Data tidak tersedia.", 404);
    this.permit(access, kind === "fulfillment" ? "orders.read" : kind === "historical" ? "payments.read" : kind === "conversations" ? "support.read" : `${kind}.read`);
    const index = Number(page || 0);
    if (!Number.isSafeInteger(index) || index < 0 || index > 100000) throw new HttpException("Halaman tidak valid.", 400);
    // Records other than products have no trustworthy service category: require all scopes.
    if (kind !== "products" && (access.categories.length < 5 || access.productSlugs.length)) throw new HttpException("Data ini memerlukan akses semua layanan.", 403);
    const scope = kind === "products" ? `&category=in.(${access.categories.filter(c => ["game", "prepaid", "apps", "social", "tasks"].includes(c)).join(",")})${access.productSlugs.length ? `&product_slug=in.(${access.productSlugs.join(",")})` : ""}` : "";
    if (kind === "products" && !access.categories.length) return { rows: [], hasMore: false, page: index };
    if (mode && !["all", "live", "sandbox"].includes(mode)) throw new HttpException("Mode transaksi tidak valid.", 400);
    if (category && (kind !== "fulfillment" || !["game", "prepaid", "apps", "social", "tasks"].includes(category))) throw new HttpException("Kategori transaksi tidak valid.", 400);
    const paymentScope = ["orders", "payments", "fulfillment"].includes(kind)
      ? mode && mode !== "all" ? `&payment_mode=eq.${mode}` : "&payment_mode=in.(live,sandbox)"
      : "";
    const rows = await adminDb(table[0], `?select=${table[1]}${scope}${paymentScope}${category ? `&category=eq.${category}` : ""}&order=${kind === "historical" ? "sale_date" : "created_at"}.desc&limit=51&offset=${index * 50}`);
    if(kind==="fulfillment"&&!category){
      const [premium,tasks]=await Promise.all([
        access.categories.includes("apps")?adminDb<any>("premium_orders","?payment_mode=eq.live&select=id,invoice_number,created_at,updated_at,product_id,product_name,amount,status,customer_email,customer_phone&order=created_at.desc&limit=100"):Promise.resolve([]),
        access.categories.includes("tasks")?adminDb<any>("task_order_specs","?select=payment_id,created_at,product_id,workflow_status,payment:payments(id,invoice_number,created_at,product_name,provider_code,target,amount,status,owner_user_id)&order=created_at.desc&limit=100"):Promise.resolve([])
      ]);
      const mappedPremium=premium.map((o:any)=>({id:o.id,invoice_number:o.invoice_number,created_at:o.created_at,updated_at:o.updated_at||o.created_at,category:"apps",product_name:o.product_name,provider_code:"premium",target:"Aplikasi premium",target_zone:null,amount:o.amount,payment_method:"QRIS",payment_reference:null,payment_status:o.status==="paid"||o.status==="delivered"?"paid":o.status==="proof_submitted"?"pending":"pending",fulfillment_status:o.status==="delivered"?"completed":"processing",provider_reference:null,provider_note:null,payment_mode:"live",review_required:o.status==="proof_submitted",fulfillment_mode:"manual",service_quantity:1,customer_email:o.customer_email,customer_phone:o.customer_phone,manual_kind:"premium",manual_status:o.status}));
      const mappedTasks=tasks.filter((t:any)=>t.payment).map((t:any)=>({id:t.payment_id,invoice_number:t.payment.invoice_number,created_at:t.created_at,updated_at:t.created_at,category:"tasks",product_name:t.payment.product_name,provider_code:"task",target:"Joki tugas",target_zone:null,amount:t.payment.amount,payment_method:"QRIS",payment_reference:null,payment_status:t.payment.status,fulfillment_status:t.workflow_status,provider_reference:null,provider_note:null,payment_mode:"live",review_required:false,fulfillment_mode:"manual",service_quantity:1,customer_email:null,customer_phone:null,manual_kind:"task",manual_status:t.workflow_status}));
      const combined=[...rows,...mappedPremium,...mappedTasks].sort((a:any,b:any)=>Date.parse(b.created_at)-Date.parse(a.created_at));
      return {rows:combined.slice(0,50),hasMore:rows.length>50||combined.length>50,page:index};
    }
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50, page: index };
  }

  @Get("catalog/:category")
  async catalog(@Param("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res);
    this.permit(access, "products.read"); this.category(access, category);
    const result = await this.catalogReader.list(category);
    if (!access.productSlugs.length) return result;
    return { ...result, items: result.items.filter(item => access.productSlugs.includes(item.productSlug)), products: result.products.filter(item => access.productSlugs.includes(item.slug)) };
  }

  private allServices(access: {categories:string[];productSlugs:string[]}) {
    if(access.categories.length<5 || access.productSlugs.length) throw new HttpException("Data ini memerlukan akses semua layanan.",403);
  }

  @Get("product-management/:category")
  async productManagement(@Param("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.readProductManagement(await this.authorize(req, res), category);
  }

  private async readProductManagement(access: Awaited<ReturnType<AdminController["authorize"]>>, category: string) {
    this.permit(access, "products.read"); this.category(access, category);
    if (!["game", "prepaid", "apps", "social", "tasks"].includes(category)) throw new HttpException("Kategori tidak valid.", 400);
    const scope = access.productSlugs.length ? `&product_slug=in.(${access.productSlugs.join(",")})` : "";
    const managed: ManagedProduct[] = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await adminDb<ManagedProduct>("managed_products", `?category=eq.${category}${scope}&select=*&order=id.asc&limit=500&offset=${offset}`);
      managed.push(...batch);
      if (batch.length < 500) break;
      if (offset >= 49500) throw new HttpException("Katalog terlalu besar untuk dimuat sekaligus.", 503);
    }
    let source: Awaited<ReturnType<CatalogController["list"]>> | null = null;
    try { source = await this.catalogReader.list(category, true); } catch { /* Saved variants remain manageable while the provider is unavailable. */ }
    const items = (source?.items || []).filter(item => !access.productSlugs.length || access.productSlugs.includes(item.productSlug)).map(item=>({...item,defaultPublished:!item.requiresManualReview && (category === "game" ? featuredGameSlugs.includes(item.productSlug) : category !== "social")}));
    return { items, managed, providerAvailable: !!source, published: process.env.ADMIN_CATALOG_ENABLED === "true", canWrite: access.permissions.includes("*") || access.permissions.includes("products.write") };
  }

  private assistantTools(access: Awaited<ReturnType<AdminController["authorize"]>>): AssistantTool[] {
    const can = (permission: string) => access.permissions.includes("*") || access.permissions.includes(permission);
    const full = assistantCategories.every(category => access.categories.includes(category)) && !access.productSlugs.length;
    const tools: AssistantTool[] = ["reply"];
    if (can("products.read") && access.categories.length) {
      tools.push("catalog_search");
      if (!access.productSlugs.length) tools.push("promotions");
      if (can("products.write")) tools.push("catalog_edit");
    }
    if (full && (can("orders.read") || can("payments.read"))) tools.push("transactions");
    if (can("orders.read") && access.categories.includes("tasks")) tools.push("task_orders");
    if (can("orders.read") && access.categories.includes("apps")) tools.push("premium_orders");
    if (full && can("orders.read") && can("payments.read")) tools.push("analytics", "operations", "balances");
    if (full && can("support.read")) tools.push("support", "support_draft");
    if (assistantConfig().attachments) tools.push("file_review");
    if (access.superAdmin) tools.push("vouchers");
    return tools;
  }

  @Get("assistant")
  async assistantStatus(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    const { configured, attachments } = assistantConfig();
    return { configured, attachments, tools: this.assistantTools(access) };
  }

  @Post("assistant/chat")
  async assistantChat(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    const config = assistantConfig();
    if (!config.configured) throw new HttpException("Asisten Anres belum diaktifkan.", 503);
    const input = assistantInput(body, config.attachments);
    const variantId = assistantObject(body).variantId;
    if (variantId !== undefined && !uuid(variantId)) throw new HttpException("Varian editor tidak valid.", 422);
    await assistantQuota(access.id);
    const scopedProduct = variantId === undefined ? null : await this.assistantEditorProduct(access, variantId as string);
    const available = this.assistantTools(access).filter(tool =>
      (!scopedProduct || tool === "reply" || tool === "catalog_edit") && (tool !== "catalog_edit" || !input.attachments.length));
    const plan = await assistantPlan(input, available);
    const arg = (key: string) => (plan as Record<string, unknown>)[key];

    switch (plan.tool) {
      case "reply": {
        const text = arg("text");
        if (typeof text !== "string" || !text.trim() || text.length > 1500) throw new HttpException("Jawaban AI tidak valid.", 502);
        return { text: redactAssistantText(text.trim()) };
      }
      case "catalog_search":
        return this.assistantCatalog(access, arg("query"), arg("category"), null);
      case "catalog_edit":
        return scopedProduct ? this.draftAssistantProduct(access, scopedProduct, assistantPatch(arg("patch")))
          : this.assistantCatalog(access, arg("query"), arg("category"), assistantPatch(arg("patch")));
      case "promotions": {
        const category = arg("category");
        if (typeof category !== "string") throw new HttpException("Sebutkan kategori promo.", 422);
        const result = await this.promotions(category, req, res);
        const now = Date.now();
        const active = result.rows.filter(row => row.active === true && Date.parse(String(row.starts_at)) <= now && now < Date.parse(String(row.ends_at)));
        const rows = active.slice(0, 8).map(row => `${row.item_code}: ${assistantRupiah.format(Number(row.sale_price))}`);
        const text = `Promo ${category}: ${active.length} aktif dari ${result.rows.length} jadwal terbaru.` +
          (rows.length ? `\n${rows.join("\n")}` : "");
        return { text, section: "catalog" };
      }
      case "transactions": {
        const view = arg("view") ?? "orders";
        const status = arg("status") ?? "all";
        const search = arg("search") ?? "";
        if (typeof view !== "string" || typeof status !== "string" || typeof search !== "string" ||
            (search && (!/^[A-Za-z0-9-]{4,80}$/.test(search) || !input.text.includes(search)))) {
          throw new HttpException("Gunakan nomor invoice yang ditulis pada pesan untuk mencari transaksi.", 422);
        }
        const result = await this.transactionRecords(view, "0", status, search, req, res);
        const outstanding = view === "fulfillment" && status === "paid";
        const rows = result.rows.filter(row => (!search || String(row.invoice_number).toLowerCase() === search.toLowerCase()) &&
          (!outstanding || !["completed", "delivered", "accepted"].includes(String(row.fulfillment_status))));
        const shown = rows.slice(0, 8).map(row =>
          [row.invoice_number, row.category, row.payment_status, row.fulfillment_status].map(value => typeof value === "string" ? value.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) : "").filter(Boolean).join(" / "));
        const text = `${rows.length} transaksi cocok di halaman hasil pertama${result.hasMore ? ". Masih ada halaman berikutnya." : "."}` +
          (shown.length ? `\n${shown.join("\n")}` : "");
        return { text, section: view };
      }
      case "task_orders":
      case "premium_orders": {
        const task = plan.tool === "task_orders";
        const result = task ? await this.taskOrders("0", req, res) : await this.premiumOrders("0", req, res);
        const counts = new Map<string, number>();
        for (const row of result.rows as Record<string, unknown>[]) {
          const raw = row[task ? "workflow_status" : "status"];
          const status = typeof raw === "string" && /^[a-z_]{1,40}$/.test(raw) ? raw : "tidak_diketahui";
          counts.set(status, (counts.get(status) ?? 0) + 1);
        }
        const text = `${result.rows.length} pesanan ${task ? "joki tugas" : "aplikasi premium"} pada halaman pertama${result.hasMore ? ". Masih ada halaman berikutnya." : "."}` +
          [...counts].map(([status, count]) => `\n${status.replaceAll("_", " ")}: ${count}`).join("");
        return { text, section: task ? "tasks" : "apps" };
      }
      case "analytics": {
        const days = arg("days") ?? 7;
        if (![7, 30, 90, "7", "30", "90"].includes(days as number | string)) throw new HttpException("Pilih periode 7, 30, atau 90 hari.", 422);
        const data = await this.analytics(String(Number(days)), req, res);
        const summary = data.summary as Record<string, unknown>;
        const required = ["orders", "paidCount", "paidAmount", "pendingCount", "failedCount", "historicalCount", "unknownCostCount"];
        if (required.some(key => !Number.isFinite(summary[key]))) throw new HttpException("Ringkasan transaksi belum lengkap.", 503);
        return { text: `Ringkasan ${days} hari (WIB)\n${summary.orders} transaksi, ${summary.paidCount} lunas dengan nilai ${assistantRupiah.format(Number(summary.paidAmount))}.\n${summary.pendingCount} menunggu pembayaran, ${summary.failedCount} gagal atau kedaluwarsa.\nPenjualan historis: ${summary.historicalCount}. Transaksi lunas tanpa data modal: ${summary.unknownCostCount}.`, section: "reports" };
      }
      case "operations": {
        const data = await this.operationalStatus(req, res);
        const checks = data.checks.filter(check => check.count > 0);
        return { text: checks.length ? checks.map(check => `${check.name}: ${check.count}`).join("\n") : "Semua pemeriksaan antrean saat ini menunjukkan 0 temuan.", section: "system" };
      }
      case "balances":
        // Balance figures remain in the dashboard instead of being sent to the model.
        return { text: "Buka Ringkasan untuk melihat saldo Tripay dan VIPayment langsung dari provider.", section: "overview" };
      case "support": {
        const { count, unreadCount } = await this.supportNotifications(req, res);
        return { text: `${count} tiket baru dan ${unreadCount} percakapan belum dibaca.`, section: "conversations" };
      }
      case "support_draft":
        return { text: await assistantAnswer(input.text, plan.tool, { context: "Situasi anonim yang dijelaskan admin", attachments: input.attachments }), section: "conversations" };
      case "file_review":
        if (!input.attachments.length) return { text: "Lampirkan file teks untuk dianalisis." };
        return { text: await assistantAnswer(input.text, plan.tool, { attachments: input.attachments }) };
      case "vouchers": {
        const { rows, hasMore } = await this.vouchers("0", req, res);
        return { text: `${rows.length} voucher pada halaman pertama${hasMore ? ", masih ada halaman berikutnya" : ""}. Buka Voucher untuk melihat kode dan pengaturannya.`, section: "vouchers" };
      }
    }
  }

  private async assistantEditorProduct(access: Awaited<ReturnType<AdminController["authorize"]>>, id: string) {
    this.permit(access, "products.read");
    this.permit(access, "products.write");
    const [row] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${id}&select=*&limit=1`);
    if (!row || row.deleted_at) throw new HttpException("Varian editor belum disimpan atau tidak ditemukan.", 404);
    this.category(access, row.category);
    this.product(access, row.product_slug);
    return row;
  }

  private assistantCatalogChoice(row: ManagedProduct) {
    return { name: row.name, product: row.product, sku: row.provider_code, category: row.category, price: Number(row.price), active: row.active };
  }

  private async assistantCatalog(
    access: Awaited<ReturnType<AdminController["authorize"]>>,
    query: unknown, category: unknown, patch: ReturnType<typeof assistantPatch> | null,
  ) {
    if (typeof query !== "string" || !query.trim() || query.length > 150 ||
        (category !== undefined && category !== null && !assistantCategories.some(value => value === category))) {
      throw new HttpException("Sebutkan nama varian atau SKU dan kategori yang valid.", 422);
    }
    if (typeof category === "string") this.category(access, category);
    const categories = access.categories.filter(value => !category || category === value);
    const data = await Promise.all(categories.map(value => this.readProductManagement(access, value)));
    const candidates = data.flatMap(result => {
      const managed = new Map(result.managed.map(row => [`${row.provider}:${row.provider_code}`, row]));
      return [
        ...result.managed.filter(row => !row.deleted_at),
        ...result.items.filter(item => item.defaultPublished && !managed.has(`vipayment:${item.code}`)).map(item => ({
          id: "", name: item.name, product: item.product, product_slug: item.productSlug, provider: "vipayment",
          provider_code: item.code, category: item.category, price: item.price, description: item.description, active: true,
        } as ManagedProduct)),
      ];
    });
    const term = query.trim().toLowerCase();
    const exactSku = candidates.filter(row => row.provider_code.toLowerCase() === term);
    const terms = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const matches = exactSku.length ? exactSku : candidates.filter(row => {
      const words = `${row.name} ${row.product} ${row.provider_code}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
      return terms.length && terms.every(term => words.some(word => /\d/.test(term) ? word === term : word.includes(term)));
    });
    const choices = matches.slice(0, 8).map(row => this.assistantCatalogChoice(row));
    const sourceIncomplete = data.some(result => !result.providerAvailable);
    if (!patch || matches.length !== 1) {
      const message = matches.length === 0 ? "Varian tidak ditemukan. Coba nama, SKU, atau kategori yang lebih spesifik."
        : patch ? "Beberapa varian cocok. Tulis SKU dan kategori varian yang ingin diubah." : `Ditemukan ${matches.length} varian dalam cakupan akses kamu.`;
      return { text: message + (sourceIncomplete ? " Sebagian katalog provider mungkin tidak tersedia." : ""), choices, section: "catalog" };
    }
    return this.draftAssistantProduct(access, matches[0]!, patch);
  }

  private async draftAssistantProduct(access: Awaited<ReturnType<AdminController["authorize"]>>, row: ManagedProduct, patch: ReturnType<typeof assistantPatch>) {
    const choice = this.assistantCatalogChoice(row);
    if (!row.id || !row.updated_at || (patch.active === true && !row.active && row.provider === "vipayment")) {
      return { text: "Varian ini perlu disimpan atau diaktifkan melalui editor katalog agar pemetaan provider dapat diperiksa.", choices: [choice], section: "catalog" };
    }
    this.permit(access, "products.write");
    this.category(access, row.category);
    this.product(access, row.product_slug);
    const old = { name: row.name, price: Number(row.price), description: row.description, active: row.active };
    const keys = (Object.keys(patch) as (keyof typeof patch)[]).filter(key => patch[key] !== old[key]);
    if (!keys.length) return { text: "Varian sudah memiliki nilai yang diminta.", choices: [choice], section: "catalog" };
    const changes = keys.map(key => ({ key, before: old[key], after: patch[key]! }));
    const id = randomUUID();
    const [saved] = await adminDb<{ id: string; expires_at: string }>("admin_assistant_proposals", "", "POST", {
      id, actor_id: access.id, product_id: row.id, category: row.category, product_slug: row.product_slug,
      product_version: row.updated_at, before_values: Object.fromEntries(keys.map(key => [key, old[key]])),
      patch: Object.fromEntries(keys.map(key => [key, patch[key]])),
    });
    if (saved?.id !== id) throw new HttpException("Draf belum dapat disimpan.", 503);
    return { text: "Tinjau draf perubahan varian. Promo aktif bisa menentukan harga yang terlihat pelanggan.", proposal: { id, expiresAt: saved.expires_at, variant: choice, changes }, section: "catalog" };
  }

  @Post("assistant/proposals/:id/apply")
  async assistantApply(@Param("id") id: string, @Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    if (!assistantConfig().configured) throw new HttpException("Asisten Anres belum diaktifkan.", 503);
    this.permit(access, "products.read");
    this.permit(access, "products.write");
    const body = assistantObject(input);
    if (!uuid(id) || body.confirm !== true || Object.keys(body).length !== 1) throw new HttpException("Konfirmasi draf tidak valid.", 400);
    const [draft] = await adminDb<{ category: string; product_slug: string }>("admin_assistant_proposals", `?id=eq.${id}&actor_id=eq.${access.id}&select=category,product_slug&limit=1`);
    if (!draft) throw new HttpException("Draf tidak ditemukan.", 404);
    this.category(access, draft.category);
    this.product(access, draft.product_slug);
    const [result] = await adminDb<{ result: string }>("rpc/apply_admin_assistant_proposal", "", "POST", { p_id: id, p_actor: access.id });
    if (result?.result === "expired") throw new HttpException("Draf kedaluwarsa. Siapkan draf baru.", 409);
    if (result?.result === "conflict") throw new HttpException("Data varian berubah. Siapkan draf baru sebelum menyimpan.", 409);
    if (result?.result !== "applied") throw new HttpException("Draf belum dapat diterapkan.", 503);
    return { ok: true, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Get("conversations/notifications")
  async supportNotifications(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res); this.permit(access,"support.read"); this.allServices(access);
    const [summary]=await adminDb<{new_count:number;unread_count:number;recent:unknown[];recent_messages:unknown[]}>("rpc/support_ticket_notifications","","POST",{});
    if(!summary) throw new HttpException("Notifikasi tiket belum tersedia.",503);
    return {count:Number(summary.new_count),unreadCount:Number(summary.unread_count),recent:summary.recent,recentMessages:summary.recent_messages};
  }

  @Post("conversations")
  async createConversation(@Body() input:{id?:unknown;user_id?:unknown;subject?:unknown;body?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"support.write"); this.allServices(access);
    if(!uuid(input?.id) || !uuid(input?.user_id) || typeof input.subject!=="string" || input.subject.trim().length<3 || input.subject.length>160 || (input.body!==undefined && (typeof input.body!=="string" || input.body.length>3000))) throw new HttpException("Isi pelanggan, subjek 3–160 karakter, dan rincian maksimal 3000 karakter.",400);
    const [customer]=await adminDb("users",`?id=eq.${input.user_id}&select=id`);
    if(!customer) throw new HttpException("Pelanggan tidak ditemukan.",404);
    await this.audit(access.id,"support.create",input.id);
    // Admin-created context stays in the subject; staff messages require acceptance.
    const [room]=await adminDb("rpc/create_support_ticket","","POST",{p_id:input.id,p_user:input.user_id,p_subject:input.subject.trim(),p_body:null});
    return room;
  }

  @Get("conversations/:id/messages")
  async conversationMessages(@Param("id") id:string,@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const readAt=new Date().toISOString();
    const access=await this.authorize(req,res); this.permit(access,"support.read"); this.allServices(access);
    if(!uuid(id)) throw new HttpException("Percakapan tidak valid.",400);
    const index=pageIndex(page);
    const [room]=await adminDb("support_conversations",`?id=eq.${id}&select=*`);
    if(!room) throw new HttpException("Percakapan tidak ditemukan.",404);
    const rows=await adminDb("support_messages",`?conversation_id=eq.${id}&select=id,body,author_role,created_at&order=created_at.desc,id.desc&limit=51&offset=${index*50}`);
    if(index===0) await adminDb("support_conversations",`?id=eq.${id}`,"PATCH",{staff_read_at:readAt});
    return {room,rows:rows.slice(0,50).reverse(),hasMore:rows.length>50};
  }

  @Post("conversations/:id/messages")
  async reply(@Param("id") id:string,@Body() input:{id?:unknown;body?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"support.write"); this.allServices(access);
    if(!uuid(id)) throw new HttpException("Percakapan tidak valid.",400);
    const message=messageInput(input);
    const [room]=await adminDb("support_conversations",`?id=eq.${id}&select=status`);
    if(!room) throw new HttpException("Percakapan tidak ditemukan.",404);
    if(room.status!=="in_progress") throw new HttpException("Terima tiket sebelum membalas.",409);
    await this.audit(access.id,"support.reply",id);
    return {rows:await adminDb("rpc/append_support_message","","POST",{p_id:message.id,p_room:id,p_actor:access.id,p_role:"staff",p_body:message.body})};
  }

  @Patch("conversations/:id")
  async conversationStatus(@Param("id") id:string,@Body() input:{status?:unknown;reason?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"support.write"); this.allServices(access);
    if(!uuid(id) || !["new","in_progress","rejected","closed"].includes(String(input?.status))) throw new HttpException("Status tidak valid.",400);
    if(input.status==="rejected" && (typeof input.reason!=="string" || !input.reason.trim() || input.reason.length>500)) throw new HttpException("Isi alasan penolakan (maksimal 500 karakter).",400);
    await this.audit(access.id,"support.status",id);
    const [row]=await adminDb("support_conversations",`?id=eq.${id}`,"PATCH",{status:input.status,rejection_reason:input.status==="rejected"?String(input.reason).trim():null,updated_at:new Date().toISOString()});
    if(!row) throw new HttpException("Percakapan tidak ditemukan.",404); return row;
  }

  @Patch("customers/:id")
  async customerName(@Param("id") id:string,@Body() input:{full_name?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"customers.write"); this.allServices(access);
    if(!uuid(id) || typeof input?.full_name!=="string" || !input.full_name.trim() || input.full_name.length>100 || /[<>\u0000-\u001f]/.test(input.full_name)) throw new HttpException("Nama tidak valid.",400);
    await this.audit(access.id,"customer.name",id);
    const [row]=await adminDb("users",`?id=eq.${id}`,"PATCH",{full_name:input.full_name.trim(),updated_at:new Date().toISOString()});
    if(!row) throw new HttpException("Pelanggan tidak ditemukan.",404);return row;
  }

  @Patch("fulfillment/:id/review")
  async markForReview(@Param("id") id:string,@Body() input:{review?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"orders.read"); this.allServices(access);
    if(!uuid(id) || typeof input?.review!=="boolean") throw new HttpException("Pilihan pemeriksaan tidak valid.",400);
    const [order]=await adminDb<{id:string;payment_mode:string;payment_status:string;fulfillment_status:string}>("live_transactions",`?id=eq.${id}&select=id,payment_mode,payment_status,fulfillment_status`);
    if(!order) throw new HttpException("Pesanan tidak ditemukan.",404);
    if(order.payment_status!=="paid") throw new HttpException("Pesanan belum lunas. Pembayaran hanya dapat diperbarui oleh gateway.",409);
    await this.audit(access.id,input.review?"order.review":"order.review_clear",id);
      const [row]=await adminDb("live_transactions",`?id=eq.${id}&payment_mode=eq.live&payment_status=eq.paid`,"PATCH",{review_required:input.review,updated_at:new Date().toISOString()});
      if(!row) throw new HttpException("Pesanan berubah. Muat ulang lalu coba lagi.",409);
    return {ok:true,review_required:input.review};
  }

  @Patch("fulfillment/:id/manual")
  async manualFulfillment(@Param("id") id:string,@Body() body:{status?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"orders.write"); this.allServices(access);
    if(!uuid(id) || !["processing","completed","failed"].includes(String(body?.status)) || typeof body.note!=="string" || !body.note.trim() || body.note.length>2000 || /[<>\u0000-\u001f]/.test(body.note)) throw new HttpException("Isi status dan catatan pengerjaan yang valid.",400);
    const [order]=await adminDb<{fulfillment_status:string}>("live_transactions",`?id=eq.${id}&fulfillment_mode=eq.manual&payment_mode=eq.live&payment_status=eq.paid&select=fulfillment_status`);
    if(!order || !["ready","processing","manual_review"].includes(order.fulfillment_status)) throw new HttpException("Pesanan manual belum lunas atau sudah berstatus akhir.",409);
    await this.audit(access.id,"order.manual_update",id);
    const [row]=await adminDb("live_transactions",`?id=eq.${id}&fulfillment_mode=eq.manual&payment_mode=eq.live&payment_status=eq.paid&fulfillment_status=eq.${order.fulfillment_status}`,"PATCH",{fulfillment_status:body.status,provider_note:body.note.trim(),updated_at:new Date().toISOString()});
    if(!row) throw new HttpException("Pesanan berubah. Muat ulang sebelum mencoba lagi.",409);
    return {ok:true};
  }

  @Get("transaction-records/:view")
  async transactionRecords(
    @Param("view") view: string,
    @Query("page") page: string,
    @Query("status") status: string,
    @Query("search") search: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const access = await this.authorize(req, res);
    if (!["orders", "payments", "fulfillment"].includes(view)) throw new HttpException("Daftar tidak tersedia.", 404);
    this.permit(access, view === "payments" ? "payments.read" : "orders.read");
    this.allServices(access);
    const index = Number(page || 0);
    const filter = status ?? "all";
    if (!Number.isSafeInteger(index) || index < 0 || index > 100000) throw new HttpException("Halaman tidak valid.", 400);
    if (!["all", "active", "pending", "paid", "failed", "refunded", "unknown", "review", "completed"].includes(filter)) {
      throw new HttpException("Status transaksi tidak valid.", 400);
    }
    if (search !== undefined && (typeof search !== "string" || search.length > 200)) {
      throw new HttpException("Kata kunci tidak valid.", 400);
    }
    const fields = "id,invoice_number,created_at,updated_at,category,product_name,provider_code,target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,provider_reference,provider_note,payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone,manual_kind,source";
    const rows = await adminDb("rpc/admin_list_transactions", `?select=${fields}`, "POST", {
      p_view: view, p_status: filter, p_search: search?.trim() ?? "", p_page: index,
    });
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50, page: index };
  }

  @Get("analytics")
  async analytics(@Query("days") days:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res); this.permit(access,"orders.read"); this.permit(access,"payments.read"); this.allServices(access);
    const period=Number(days || 30); if(![7,30,90].includes(period)) throw new HttpException("Periode tidak valid.",400);
    const [result]=await adminDb<{summary?:{paidCount?:number}}>("rpc/admin_transaction_analytics","","POST",{p_days:period});
    if (typeof result?.summary?.paidCount !== "number") throw new HttpException("Terapkan migrasi laporan transaksi terbaru.", 503);
    return result;
  }

  @Get("provider-balances")
  async providerBalances(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res); this.permit(access,"orders.read"); this.permit(access,"payments.read"); this.allServices(access);
    const results=await Promise.allSettled([new TripayClient().balance(),new VipaymentClient().balance()]);
    const tripayConfigMissing = results[0].status === "rejected" &&
      results[0].reason instanceof HttpException && results[0].reason.getStatus() === 503;
    return {
      tripay: results[0].status === "fulfilled" ? { balance: results[0].value, available: true } : { balance: null, available: false, status: tripayConfigMissing ? "setup_required" : "unavailable" },
      vipayment: results[1].status === "fulfilled" ? { balance: results[1].value, available: true } : { balance: null, available: false, message: "Saldo VIPayment tidak dapat dimuat." },
      checkedAt: new Date().toISOString(),
    };
  }

  @Get("task-pricing/:id")
  async taskPricing(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res);this.permit(access,"products.read");this.category(access,"tasks");
    if(!uuid(id)) throw new HttpException("Produk tidak valid.",400);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${id}&category=eq.tasks&select=product_slug`);
    if(!product) throw new HttpException("Produk tidak ditemukan.",404);
    this.product(access,product.product_slug);
    const [rule]=await adminDb("task_price_rules",`?product_id=eq.${id}&select=*`);
    return {rule:rule??null};
  }

  @Get("premium-rules/:id")
  async premiumRules(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res);this.permit(access,"products.read");this.category(access,"apps");
    if(!uuid(id))throw new HttpException("Produk tidak valid.",400);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${id}&category=eq.apps&select=product_slug`);
    if(!product)throw new HttpException("Produk tidak ditemukan.",404);
    this.product(access,product.product_slug);
    const [rule]=await adminDb("premium_product_rules",`?product_id=eq.${id}&select=*`);
    return {rule:rule??null};
  }

  @Post("premium-rules/:id")
  async savePremiumRules(@Param("id") id:string,@Body() body:{access_type?:unknown;duration_days?:unknown;guarantee_days?:unknown;guarantee_terms?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"products.write");this.category(access,"apps");
    if(!uuid(id)||!["private","sharing","other"].includes(String(body?.access_type))||!Number.isSafeInteger(body.duration_days)||Number(body.duration_days)<1||Number(body.duration_days)>730||!Number.isSafeInteger(body.guarantee_days)||Number(body.guarantee_days)<0||Number(body.guarantee_days)>365||typeof body.guarantee_terms!=="string"||body.guarantee_terms.trim().length<10||body.guarantee_terms.length>2000)throw new HttpException("Aturan aplikasi premium tidak valid.",400);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${id}&category=eq.apps&provider=eq.manual&select=product_slug`);
    if(!product)throw new HttpException("Produk tidak ditemukan.",404);
    this.product(access,product.product_slug);await this.audit(access.id,"premium_rule.save",id);
    const [rule]=await adminDb("premium_product_rules","?on_conflict=product_id","POST",{product_id:id,access_type:body.access_type,duration_days:body.duration_days,guarantee_days:body.guarantee_days,guarantee_terms:body.guarantee_terms.trim(),updated_at:new Date().toISOString()});
    return {rule};
  }

  @Get("premium-qris")
  async premiumQris(@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res);this.permit(access,"products.read");this.category(access,"apps");
    const [row]=await adminDb<{id:number;image:string|null;updated_at:string}>("premium_qris_settings","?id=eq.1&select=id,image,updated_at");
    return {qris:row??null};
  }

  @Post("premium-qris")
  async savePremiumQris(@Body() body:{image?:unknown;payload?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"products.write");this.category(access,"apps");
    const image=premiumImage(body?.image);if(typeof body?.payload!=="string")throw new HttpException("QRIS tidak terbaca dari gambar.",400);qrisForAmount(body.payload,1);await this.audit(access.id,"premium_qris.save","global");
    const [qris]=await adminDb("premium_qris_settings","?on_conflict=id","POST",{id:1,image,payload:body.payload,updated_at:new Date().toISOString()});
    return {qris};
  }

  @Delete("premium-qris")
  async removePremiumQris(@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"products.write");this.category(access,"apps");await this.audit(access.id,"premium_qris.remove","global");
    await adminDb("rpc/remove_premium_qris","","POST",{});return {removed:true};
  }

  private async premiumOrderAccess(access:{categories:string[];productSlugs:string[]},id:string){
    this.category(access,"apps");if(!uuid(id))throw new HttpException("Pesanan tidak valid.",400);
    const [order]=await adminDb<{id:string;product_id:string;user_id:string|null;status:string;conversation_id:string|null}>("premium_orders",`?id=eq.${id}&payment_mode=eq.live&select=id,product_id,user_id,status,conversation_id`);
    if(!order)throw new HttpException("Pesanan aplikasi tidak ditemukan.",404);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${order.product_id}&select=product_slug`);
    if(!product)throw new HttpException("Produk tidak ditemukan.",404);
    this.product(access,product.product_slug);return order;
  }

  @Get("premium-orders")
  async premiumOrders(@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res);this.permit(access,"orders.read");this.category(access,"apps");const index=pageIndex(page);
    let scope="";if(access.productSlugs.length){const products=await adminDb<{id:string}>("managed_products",`?category=eq.apps&product_slug=in.(${access.productSlugs.join(",")})&select=id`);if(!products.length)return {rows:[],hasMore:false,page:index};scope=`&product_id=in.(${products.map(row=>row.id).join(",")})`}
    const rows=await adminDb("premium_orders",`?payment_mode=eq.live&select=id,invoice_number,user_id,product_id,product_name,access_type,duration_days,guarantee_days,amount,status,created_at,paid_at,delivered_at,conversation_id${scope}&order=created_at.desc&limit=51&offset=${index*50}`);
    return {rows:rows.slice(0,50),hasMore:rows.length>50,page:index};
  }

  @Get("premium-orders/:id")
  async premiumOrderDetail(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res);this.permit(access,"orders.read");await this.premiumOrderAccess(access,id);
    const [order]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&select=*`);
    const [claim]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&select=*`);
    return {order,claim:claim??null};
  }

  @Post("premium-orders/:id/qr")
  async premiumQr(@Param("id") id:string,@Body() body:{image?:unknown;expiresAt?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");await this.premiumOrderAccess(access,id);
    const image=premiumImage(body?.image),expiry=typeof body?.expiresAt==="string"?Date.parse(body.expiresAt):NaN;
    if(!Number.isFinite(expiry)||expiry<Date.now()+60000||expiry>Date.now()+86400000)throw new HttpException("Masa berlaku QRIS harus 1 menit sampai 24 jam.",400);
    await this.audit(access.id,"premium.qr_upload",id);
    const [order]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&status=in.(awaiting_qr,awaiting_payment,proof_submitted)`,"PATCH",{qr_image:image,qr_expires_at:new Date(expiry).toISOString(),proof_image:null,proof_note:null,status:"awaiting_payment",updated_at:new Date().toISOString()});
    if(!order)throw new HttpException("Status pesanan berubah. Muat ulang.",409);return {order};
  }

  @Post("premium-orders/:id/verify")
  async premiumVerify(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"payments.read");this.permit(access,"orders.write");await this.premiumOrderAccess(access,id);
    await this.audit(access.id,"premium.payment_verified",id);
    const [order]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&status=eq.proof_submitted&proof_image=not.is.null`,"PATCH",{status:"paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    if(!order)throw new HttpException("Bukti belum dikirim atau status berubah.",409);return {order};
  }

  @Post("premium-orders/:id/reject-payment")
  async premiumRejectPayment(@Param("id") id:string,@Body() body:{note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"payments.read");this.permit(access,"orders.write");await this.premiumOrderAccess(access,id);
    if(typeof body?.note!=="string"||body.note.trim().length<5||body.note.length>500)throw new HttpException("Alasan penolakan harus 5–500 karakter.",400);
    await this.audit(access.id,"premium.payment_rejected",id);
    const [order]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&status=eq.proof_submitted`,"PATCH",{status:"awaiting_payment",proof_image:null,proof_note:body.note.trim(),updated_at:new Date().toISOString()});
    if(!order)throw new HttpException("Bukti sudah diproses atau status berubah.",409);return {order};
  }

  @Post("premium-orders/:id/send")
  async premiumSend(@Param("id") id:string,@Body() body:{kind?:unknown;data?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");const order=await this.premiumOrderAccess(access,id);
    if(!["credentials","code"].includes(String(body?.kind))||typeof body?.data!=="string"||body.data.trim().length<1||body.data.length>10000)throw new HttpException("Data pengiriman tidak valid.",400);
    if(!["paid","delivered"].includes(order.status))throw new HttpException("Pembayaran belum diverifikasi.",409);
    const [full]=await adminDb<{customer_email:string|null;conversation_id:string|null}>("premium_orders",`?id=eq.${id}&select=customer_email,conversation_id`);
    const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,password=process.env.SMTP_PASSWORD,from=process.env.SMTP_FROM;
    if(!host||!user||!password||!from||!full?.customer_email)throw new HttpException("Email pelanggan atau SMTP belum tersedia.",503);
    await this.audit(access.id,`premium.email.${body.kind}`,id);
    const transport=nodemailer.createTransport({host,port,secure:process.env.SMTP_SECURE==="true"||port===465,auth:{user,pass:password},requireTLS:port!==465&&process.env.SMTP_SECURE!=="true",tls:{rejectUnauthorized:true}});
    try{await transport.sendMail({from,to:full.customer_email,subject:body.kind==="code"?`Kode aplikasi premium · ${id.slice(0,8)}`:`Data aplikasi premium · ${id.slice(0,8)}`,text:`${body.kind==="code"?"Kode verifikasi":"Data akses aplikasi"}\n\n${body.data.trim()}\n\nInvoice: ${id}\nAnres Store`})}catch{throw new HttpException("Email belum dapat dikirim.",502)}finally{transport.close()}
    if(full.conversation_id){const bodyText=`${body.kind==="code"?"Kode verifikasi":"Data akses aplikasi"}:\n${body.data.trim()}`;await adminDb("rpc/append_support_message","","POST",{p_id:randomUUID(),p_room:full.conversation_id,p_actor:access.id,p_role:"staff",p_body:bodyText})}
    return {sent:true,chat:!!full.conversation_id};
  }

  @Post("premium-orders/:id/chat")
  async premiumChat(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"support.write");const order=await this.premiumOrderAccess(access,id);
    if(!order.user_id)throw new HttpException("Pesanan guest belum terhubung ke akun chat. Hubungi pelanggan melalui email atau WhatsApp yang tercatat di pesanan.",409);
    if(!["paid","delivered"].includes(order.status))throw new HttpException("Pembayaran belum diverifikasi.",409);
    if(order.conversation_id)return {conversationId:order.conversation_id};
    const roomId=randomUUID();await this.audit(access.id,"premium.chat_open",id);
    await adminDb("rpc/create_support_ticket","","POST",{p_id:roomId,p_user:order.user_id,p_subject:`Aplikasi premium ${id}`,p_body:null});
    const [saved]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&conversation_id=is.null`,"PATCH",{conversation_id:roomId});
    return {conversationId:saved?roomId:(await this.premiumOrderAccess(access,id)).conversation_id};
  }

  @Post("premium-orders/:id/deliver")
  async premiumDeliver(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");const order=await this.premiumOrderAccess(access,id);
    if(order.status!=="paid"||(!order.conversation_id&&order.user_id))throw new HttpException("Buka chat privat dan kirim akun sebelum menandai selesai.",409);
    if(order.conversation_id){const messages=await adminDb("support_messages",`?conversation_id=eq.${order.conversation_id}&author_role=eq.staff&select=id&limit=1`);if(!messages.length)throw new HttpException("Kirim data akun melalui chat privat dahulu.",409);}
    await this.audit(access.id,"premium.deliver",id);
    const [saved]=await adminDb("premium_orders",`?id=eq.${id}&payment_mode=eq.live&status=eq.paid`,"PATCH",{status:"delivered",delivered_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    if(!saved)throw new HttpException("Status pesanan berubah.",409);return {order:saved};
  }

  @Post("premium-orders/:id/claim-decision")
  async premiumClaimDecision(@Param("id") id:string,@Body() body:{decision?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");await this.premiumOrderAccess(access,id);
    if(!["accepted","rejected","fulfilled"].includes(String(body?.decision))||typeof body.note!=="string"||body.note.trim().length<3||body.note.length>2000)throw new HttpException("Keputusan garansi tidak valid.",400);
    await this.audit(access.id,`premium.claim.${body.decision}`,id);
    const allowed=body.decision==="fulfilled"?"accepted":"pending";
    const [claim]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&status=eq.${allowed}`,"PATCH",{status:body.decision,admin_note:body.note.trim(),decided_at:new Date().toISOString()});
    if(!claim)throw new HttpException("Klaim sudah berubah atau belum diajukan.",409);return {claim};
  }

  @Post("task-pricing/:id")
  async saveTaskPricing(@Param("id") id:string,@Body() input:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);this.permit(access,"products.write");this.category(access,"tasks");
    if(!uuid(id)) throw new HttpException("Produk tidak valid.",400);
    const body=input as Record<string,unknown>;
    const limits:Record<string,[number,number]>={price_per_page:[0,1000000],price_per_revision:[0,1000000],rush_fee_per_day:[0,1000000],standard_days:[1,90],max_pages:[1,500],max_revisions:[0,20]};
    if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(key=>key!=="pricing_unit"&&key!=="base_fee"&&!Object.hasOwn(limits,key)) || (body.pricing_unit!==undefined && (typeof body.pricing_unit!=="string" || !["page","slide","minute","item","custom"].includes(body.pricing_unit))) || (body.base_fee!==undefined && body.base_fee!==null && (!Number.isSafeInteger(body.base_fee) || Number(body.base_fee)<0 || Number(body.base_fee)>100000000)) || Object.entries(limits).some(([key,[min,max]])=>!Number.isSafeInteger(body[key]) || Number(body[key])<min || Number(body[key])>max)) throw new HttpException("Aturan harga tugas tidak valid.",400);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${id}&category=eq.tasks&select=product_slug`);
    if(!product) throw new HttpException("Produk tidak ditemukan.",404);
    this.product(access,product.product_slug);await this.audit(access.id,"task_pricing.save",id);
    const [rule]=await adminDb("task_price_rules","?on_conflict=product_id","POST",{product_id:id,...body,updated_at:new Date().toISOString()});
    return {rule};
  }

  private async taskOrderAccess(access:{categories:string[];productSlugs:string[]},id:string) {
    this.category(access,"tasks");
    if(!uuid(id)) throw new HttpException("Pesanan tidak valid.",400);
    const [task]=await adminDb<{payment_id:string;product_id:string;workflow_status:string}>("task_order_specs",`?payment_id=eq.${id}&select=payment_id,product_id,workflow_status`);
    if(!task) throw new HttpException("Pesanan joki tidak ditemukan.",404);
    const [product]=await adminDb<{product_slug:string}>("managed_products",`?id=eq.${task.product_id}&select=product_slug`);
    if(!product) throw new HttpException("Paket joki tidak ditemukan.",404);
    this.product(access,product.product_slug);
    return task;
  }

  @Get("task-orders")
  async taskOrders(@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res);this.permit(access,"orders.read");this.category(access,"tasks");
    const index=pageIndex(page);
    let scope="";
    if(access.productSlugs.length){
      const products=await adminDb<{id:string}>("managed_products",`?category=eq.tasks&product_slug=in.(${access.productSlugs.join(",")})&select=id`);
      if(!products.length)return {rows:[],hasMore:false,page:index};
      scope=`&product_id=in.(${products.map(p=>p.id).join(",")})`;
    }
    const specs=await adminDb<Record<string,unknown>>("task_order_specs",`?select=*${scope}&order=created_at.desc&limit=51&offset=${index*50}`);
    const ids=specs.map(row=>row.payment_id).filter((id):id is string=>typeof id==="string");
    const payments=ids.length?await adminDb<{id:string;invoice_number:string;product_name:string;amount:number;status:string;customer_name:string;customer_email:string}>("payments",`?id=in.(${ids.join(",")})&select=id,invoice_number,product_name,amount,status,customer_name,customer_email`):[];
    return {rows:specs.slice(0,50).map(row=>({...row,payment:payments.find(p=>p.id===row.payment_id)??null})),hasMore:specs.length>50,page:index};
  }

  @Get("task-orders/:id/revisions")
  async taskRevisions(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res);this.permit(access,"orders.read");await this.taskOrderAccess(access,id);
    return {rows:await adminDb("task_revisions",`?payment_id=eq.${id}&select=*&order=created_at.asc`)};
  }

  @Patch("task-orders/:id/start")
  async startTask(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");await this.taskOrderAccess(access,id);
    await this.audit(access.id,"task.start",id);
    const [row]=await adminDb("rpc/start_task_order","","POST",{p_payment:id});
    if(!row)throw new HttpException("Status tugas berubah. Muat ulang.",409);
    return {task:row};
  }

  @Post("task-orders/:id/deliver")
  async deliverTask(@Param("id") id:string,@Body() body:{url?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");await this.taskOrderAccess(access,id);
    if(typeof body?.url!=="string" || body.url.length>500 || !/^https:\/\/[^\s]+$/.test(body.url)) throw new HttpException("Tautan hasil HTTPS tidak valid.",400);
    await this.audit(access.id,"task.deliver",id);
    const [row]=await adminDb("rpc/deliver_task_result","","POST",{p_payment:id,p_url:body.url});
    return {task:row};
  }

  @Post("task-orders/:id/revisions/:revisionId/decision")
  async decideTaskRevision(@Param("id") id:string,@Param("revisionId") revisionId:string,@Body() body:{decision?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
    const access=await this.authorize(req,res,true);this.permit(access,"orders.write");await this.taskOrderAccess(access,id);
    if(!uuid(revisionId) || !["accepted","rejected"].includes(String(body?.decision)) || typeof body?.note!=="string" || body.note.trim().length<3 || body.note.length>2000) throw new HttpException("Keputusan revisi tidak valid.",400);
    await this.audit(access.id,`task.revision.${body.decision}`,revisionId);
    const [row]=await adminDb("rpc/decide_task_revision","","POST",{p_payment:id,p_id:revisionId,p_decision:body.decision,p_note:body.note});
    return {revision:row};
  }

  @Get("system/operations")
  async operationalStatus(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res); this.permit(access,"orders.read"); this.permit(access,"payments.read"); this.allServices(access);
    const url=process.env.SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) throw new HttpException("Pemeriksaan database belum dikonfigurasi.",503);
    const ago=(minutes:number)=>new Date(Date.now()-minutes*60000).toISOString();
    const checks=[
      {name:"Pembayaran tidak pasti",table:"payments",filter:"status=eq.unknown",severity:"critical"},
      {name:"Pembuatan pembayaran tertahan",table:"payments",filter:`status=eq.creating&created_at=lt.${ago(5)}`,severity:"warning"},
      {name:"Pembayaran pending lama",table:"payments",filter:`status=eq.pending&created_at=lt.${ago(60)}`,severity:"warning"},
      {name:"Pengiriman tidak pasti",table:"live_transactions",filter:"fulfillment_status=eq.unknown",severity:"critical"},
      {name:"Tinjauan manual",table:"live_transactions",filter:"fulfillment_status=eq.manual_review",severity:"warning"},
      {name:"Ditandai perlu ditinjau",table:"live_transactions",filter:"review_required=eq.true",severity:"warning"},
      {name:"Pengiriman tertahan",table:"live_transactions",filter:`fulfillment_status=eq.dispatching&updated_at=lt.${ago(3)}`,severity:"critical"},
      {name:"Antrean pengiriman lama",table:"live_transactions",filter:`payment_status=eq.paid&fulfillment_status=eq.ready&created_at=lt.${ago(15)}`,severity:"warning"},
      {name:"Pemrosesan lama",table:"live_transactions",filter:`fulfillment_status=eq.processing&created_at=lt.${ago(60)}`,severity:"warning"},
      {name:"Pembayaran lunas, pengiriman gagal",table:"live_transactions",filter:"payment_status=eq.paid&fulfillment_status=eq.failed",severity:"critical"},
      {name:"Joki belum dimulai",table:"task_order_specs",filter:`workflow_status=eq.queued&created_at=lt.${ago(15)}`,severity:"warning"},
      {name:"Joki menunggu pengerjaan terlalu lama",table:"task_order_specs",filter:`workflow_status=in.(working,revision_working)&created_at=lt.${ago(60)}`,severity:"warning"},
      {name:"Joki menunggu keputusan revisi",table:"task_order_specs",filter:`workflow_status=eq.revision_requested&created_at=lt.${ago(60)}`,severity:"warning"},
      {name:"Premium menunggu QRIS",table:"premium_orders",filter:`status=eq.awaiting_qr&created_at=lt.${ago(15)}`,severity:"warning"},
      {name:"Premium menunggu verifikasi pembayaran",table:"premium_orders",filter:`status=eq.proof_submitted&updated_at=lt.${ago(30)}`,severity:"warning"},
      {name:"Premium menunggu pengiriman akun",table:"premium_orders",filter:`status=eq.paid&paid_at=lt.${ago(60)}`,severity:"critical"},
      {name:"Klaim garansi premium menunggu keputusan",table:"premium_guarantee_claims",filter:`status=eq.pending&created_at=lt.${ago(60)}`,severity:"warning"},
    ] as const;
    const results=await Promise.all(checks.map(async check=>{
      const paymentModeFilter=check.table==="payments"||check.table==="live_transactions"?"&payment_mode=eq.live":check.table==="premium_orders"?"&payment_mode=eq.live":"";
      const response=await boundedFetch(`${url}/rest/v1/${check.table}?select=id${paymentModeFilter}&${check.filter}`,{method:"HEAD",headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:`Bearer ${key}`}),Prefer:"count=exact",Range:"0-0"}});
      const count=response.headers.get("content-range")?.split("/")[1];
      if(!response.ok||!/^\d+$/.test(count||"")) throw new HttpException("Pemeriksaan antrean database tidak tersedia.",503);
      return {name:check.name,count:Number(count),severity:check.severity};
    }));
    return {at:new Date().toISOString(),status:results.some(result=>result.count>0)?"attention":"ok",checks:results};
  }

  private async voucherAdmin(req: Request, res: Response, write = false) {
    const access = await this.authorize(req, res, write);
    if (!access.superAdmin) throw new HttpException("Voucher memerlukan akses super admin.", 403);
    return access;
  }

  private async reviewAdmin(req: Request, res: Response, write = false) {
    const access = await this.authorize(req, res, write);
    if (!access.superAdmin) throw new HttpException("Ulasan pelanggan memerlukan akses super admin.", 403);
    return access;
  }

  @Get("reviews")
  async productReviews(@Query("page") page: string, @Query("status") status: string,
    @Query("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.reviewAdmin(req, res);
    const index = pageIndex(page);
    const selectedStatus = status || "pending";
    const states = ["pending", "published", "hidden", "rejected", "all"];
    const categories = ["game", "prepaid", "apps", "social", "tasks"];
    if (!states.includes(selectedStatus) || (category && !categories.includes(category)))
      throw new HttpException("Filter ulasan tidak valid.", 400);
    const filter = `${selectedStatus !== "all" ? `&status=eq.${encodeURIComponent(selectedStatus)}` : ""}`+
      `${category ? `&category=eq.${encodeURIComponent(category)}` : ""}`;
    const rows = await adminDb("product_reviews",
      `?select=id,category,product_slug,rating,comment,reviewer_email,reviewer_user_id,status,created_at,updated_at&order=created_at.desc,id&limit=51&offset=${index * 50}${filter}`);
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
  }

  @Patch("reviews/:id")
  async updateProductReview(@Param("id") id: string, @Body() body: unknown,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.reviewAdmin(req, res, true);
    if (!uuid(id)) throw new HttpException("Ulasan tidak ditemukan.", 404);
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) {
      if (!["pending", "published", "hidden", "rejected"].includes(String(input.status)))
        throw new HttpException("Status ulasan tidak valid.", 400);
      patch.status = input.status;
    }
    if (input.rating !== undefined) {
      if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5)
        throw new HttpException("Rating harus 1–5 bintang.", 400);
      patch.rating = Number(input.rating);
    }
    if (input.comment !== undefined) {
      if (typeof input.comment !== "string" || input.comment.trim().length < 5 || input.comment.trim().length > 1000 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.comment))
        throw new HttpException("Komentar harus 5–1000 karakter.", 400);
      patch.comment = input.comment.trim();
    }
    if (Object.keys(patch).length === 1) throw new HttpException("Perubahan ulasan kosong.", 400);
    await this.audit(access.id, "product_review.update", id);
    const [row] = await adminDb("product_reviews", `?id=eq.${encodeURIComponent(id)}&select=id,status,rating,comment,updated_at`, "PATCH", patch);
    if (!row) throw new HttpException("Ulasan tidak ditemukan.", 404);
    return { review: row };
  }

  @Delete("reviews/:id")
  async deleteProductReview(@Param("id") id: string, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    const access = await this.reviewAdmin(req, res, true);
    if (!uuid(id)) throw new HttpException("Ulasan tidak ditemukan.", 404);
    await this.audit(access.id, "product_review.delete", id);
    const rows = await adminDb("product_reviews", `?id=eq.${encodeURIComponent(id)}&select=id`, "DELETE");
    if (!rows.length) throw new HttpException("Ulasan tidak ditemukan.", 404);
    return { deleted: true };
  }

  @Get("vouchers")
  async vouchers(@Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.voucherAdmin(req, res);
    const index = pageIndex(page);
    const rows = await adminDb("vouchers", `?select=*&order=created_at.desc,id&limit=51&offset=${index * 50}`);
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
  }

  @Post("vouchers")
  async saveVoucher(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.voucherAdmin(req, res, true);
    const voucher = parseVoucherSettings(input);
    const { id, version } = input as { id?: string; version?: number };
    if (id !== undefined && (typeof id !== "string" || !voucherUuid.test(id) || !Number.isSafeInteger(version) || Number(version) < 1))
      throw new HttpException("Versi voucher tidak valid. Muat ulang daftar.", 400);
    if (voucher.active && voucher.product_slug) {
      const data = await this.catalogReader.list(String(voucher.category));
      if (!data.items.some(item => item.productSlug === voucher.product_slug &&
        (!voucher.variant_code || item.code === voucher.variant_code)))
        throw new HttpException("Produk atau varian tidak tersedia di katalog aktif.", 409);
    }
    const key = id ?? randomUUID();
    await this.audit(access.id, id ? "voucher.update" : "voucher.create", key);
    const path = id ? `vouchers?id=eq.${id}&version=eq.${version}` : "vouchers";
    let rows: Record<string, unknown>[];
    try {
      rows = await this.voucherStore.request(path, id ? "PATCH" : "POST", {
        ...voucher, ...(id ? { version: version! + 1 } : { id: key }), updated_at: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409)
        throw new HttpException("Kode voucher sudah digunakan atau pengaturan bertentangan.", 409);
      throw error;
    }
    if (!rows[0]) throw new HttpException("Voucher berubah sejak dibuka. Muat ulang sebelum menyimpan.", 409);
    return { voucher: rows[0] };
  }

  @Get("vouchers/:id")
  async voucherDetails(@Param("id") id: string, @Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.voucherAdmin(req, res);
    if (!voucherUuid.test(id)) throw new HttpException("Voucher tidak ditemukan.", 404);
    const [accounts, usage] = await Promise.all([
      this.voucherStore.rpc<unknown[]>("voucher_admin_accounts", { p_voucher: id, p_offset: pageIndex(page) * 50 }),
      this.voucherStore.rpc("voucher_admin_usage", { p_voucher: id }),
    ]);
    return { accounts: accounts.slice(0, 50), hasMore: accounts.length > 50, usage };
  }

  @Post("vouchers/:id/accounts")
  async voucherAccount(@Param("id") id: string, @Body() body: { email?: unknown; active?: unknown },
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.voucherAdmin(req, res, true);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!voucherUuid.test(id) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof body?.active !== "boolean")
      throw new HttpException("Isi email akun yang valid.", 400);
    try {
      await this.voucherStore.rpc("voucher_set_account", { p_voucher: id, p_email: email, p_active: body.active, p_actor: access.id });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409)
        throw new HttpException("Voucher atau akun dengan email terverifikasi tidak ditemukan.", 409);
      throw error;
    }
    return { saved: true };
  }

  @Get("vouchers/:id/redemptions")
  async voucherRedemptions(@Param("id") id: string, @Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.voucherAdmin(req, res);
    if (!voucherUuid.test(id)) throw new HttpException("Voucher tidak ditemukan.", 404);
    const rows = await this.voucherStore.rpc<unknown[]>("voucher_admin_redemptions", { p_voucher: id, p_offset: pageIndex(page) * 50 });
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
  }

  @Post("vouchers/:id/release-premium")
  async releasePremiumVoucher(@Param("id") id: string, @Body() body: { orderId?: unknown; confirmedUnpaid?: unknown },
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.voucherAdmin(req, res, true);
    if (!voucherUuid.test(id) || typeof body?.orderId !== "string" || !voucherUuid.test(body.orderId) || body.confirmedUnpaid !== true)
      throw new HttpException("Periksa mutasi QRIS dan konfirmasi pesanan belum dibayar.", 400);
    await this.voucherStore.rpc("voucher_release_premium", { p_voucher: id, p_order: body.orderId, p_actor: access.id });
    return { released: true };
  }

  @Get("promotions/:category")
  async promotions(@Param("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res); this.permit(access, "products.read"); this.category(access, category);
    if (!["game", "prepaid", "apps", "social", "tasks"].includes(category)) throw new HttpException("Kategori tidak valid.", 400);
    if (access.productSlugs.length) throw new HttpException("Daftar promo belum mendukung pembatasan sublayanan.", 403);
    return { rows: await adminDb("catalog_promotions", `?category=eq.${category}&select=*&order=updated_at.desc&limit=500`) };
  }

  @Post("promotions")
  async savePromotion(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true); this.permit(access, "products.write");
    const body = input as { category?: unknown; item_code?: unknown; sale_price?: unknown; starts_at?: unknown; ends_at?: unknown; active?: unknown };
    if (!body || typeof body.category !== "string" || !["game", "prepaid", "apps", "social", "tasks"].includes(body.category) || typeof body.item_code !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(body.item_code) || !Number.isSafeInteger(body.sale_price) || Number(body.sale_price) < 1 || Number(body.sale_price) > 100000000 || typeof body.starts_at !== "string" || typeof body.ends_at !== "string" || !Number.isFinite(Date.parse(body.starts_at)) || !Number.isFinite(Date.parse(body.ends_at)) || Date.parse(body.ends_at) <= Date.parse(body.starts_at) || typeof body.active !== "boolean") throw new HttpException("Periksa varian, harga, dan jadwal promo.", 400);
    this.category(access, body.category);
    const item = (await this.catalogReader.list(body.category)).items.find(row => row.code === body.item_code);
    const regularPrice = item?.promotion?.originalPrice ?? item?.price;
    if (!item || !regularPrice || Number(body.sale_price) >= regularPrice) throw new HttpException("Varian tidak tersedia atau harga promo tidak lebih rendah dari harga dasar.", 400);
    this.product(access, item.productSlug);
    await this.audit(access.id, "promotion.save", `${body.category}:${body.item_code}`);
    const { category, item_code, sale_price, starts_at, ends_at, active } = body;
    const [row] = await adminDb("catalog_promotions", "?on_conflict=category,item_code", "POST", { category, item_code, sale_price, starts_at, ends_at, active, updated_at: new Date().toISOString() });
    return { promotion: row, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }
  @Post("products")
  async saveProduct(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    this.permit(access, "products.write");
    const body = input as ManagedProduct;
    const string = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
    if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
      !string(body.provider, 60) || !/^[a-z0-9_-]+$/.test(body.provider) || !string(body.provider_code, 120) || !/^[A-Za-z0-9._-]+$/.test(body.provider_code) ||
      !["game", "prepaid", "apps", "social", "tasks"].includes(body.category) || !string(body.product, 100) || !string(body.name, 200) ||
      !string(body.product_slug, 100) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.product_slug) ||
      (body.section !== undefined && body.section !== null && (typeof body.section !== "string" || body.section.length > 100 || /[<>\u0000-\u001f]/.test(body.section))) ||
      !Number.isSafeInteger(body.price) || body.price < 1 || body.price > 100000000 || typeof body.active !== "boolean" ||
      typeof body.description !== "string" || body.description.length > 2000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.description)) throw new HttpException("Periksa data produk, kode provider, slug, dan harga rupiah.", 400);
    this.category(access, body.category);
    this.product(access, body.product_slug);
    const fulfillment_mode = body.provider === "vipayment" ? (body.fulfillment_mode || "vipayment") : "manual";
    const supplier_code = body.supplier_code || body.provider_code;
    const service_quantity = body.service_quantity ?? (body.category === "social" ? 1000 : 1);
    if (!["manual","vipayment"].includes(fulfillment_mode) || !/^[A-Za-z0-9._-]{1,120}$/.test(supplier_code) || !Number.isSafeInteger(service_quantity) || service_quantity < 1 || service_quantity > 10000000 || (["tasks", "apps"].includes(body.category) && (body.provider === "vipayment" || fulfillment_mode !== "manual"))) throw new HttpException("Pemetaan provider atau jumlah layanan tidak valid.",400);
    if (body.cost_price != null && (!Number.isSafeInteger(body.cost_price) || body.cost_price < 0 || body.cost_price > 100000000)) throw new HttpException("Harga modal harus bilangan rupiah antara 0 dan 100.000.000.", 400);
    const { id, provider, provider_code, category, product, product_slug, name, price, description, active } = body;
    // Resolve the persisted identity before checking supplier availability. Ordinary
    // presentation edits must remain writable during a supplier outage.
    const [byId] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${id}&select=*&limit=1`);
    if (byId) { this.category(access, byId.category); this.product(access, byId.product_slug); }
    if (byId?.provider && (byId.provider !== provider || byId.provider_code !== provider_code || byId.category !== category)) throw new HttpException("Identitas varian tersimpan tidak dapat diganti. Tambahkan varian baru untuk SKU lain.", 409);
    const [existing] = await adminDb<ManagedProduct>("managed_products", `?provider=eq.${provider}&category=eq.${category}&provider_code=eq.${provider_code}&select=*&limit=1`);
    if (existing) this.product(access, existing.product_slug);
    const stored = existing ?? byId;
    const sameService = stored?.active && !stored.deleted_at &&
      (stored.supplier_code || stored.provider_code) === supplier_code &&
      (stored.fulfillment_mode || "vipayment") === fulfillment_mode &&
      (stored.service_quantity ?? (category === "social" ? 1000 : 1)) === service_quantity;
    if (active && provider === "vipayment" && !sameService) {
      const source = (await this.catalogReader.list(category,true)).items.find(item=>item.code===supplier_code);
      if (source?.requiresManualReview && fulfillment_mode !== "manual") throw new HttpException("Layanan ini memerlukan pemrosesan manual oleh tim admin.",400);
      if (!source || (category === "social" && (service_quantity < source.minimum! || service_quantity > source.maximum!))) throw new HttpException("Layanan provider atau jumlah paket tidak tersedia.",400);
    }
    await this.audit(access.id, "product.save", existing?.id ?? id);
    const section = typeof body.section === "string" ? body.section.trim() || null : stored?.section || null;
    const [row] = await adminDb("managed_products", "?on_conflict=id", "POST", { id: existing?.id ?? id, provider, provider_code, category, product: product.trim(), product_slug, section, name: name.trim(), price, cost_price: body.cost_price ?? null, description: description.trim(), active, deleted_at: null, fulfillment_mode, supplier_code, service_quantity, updated_at: new Date().toISOString() });
    if (!row) throw new HttpException("Varian gagal disimpan.", 503);
    return { product: row, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Post("products/remove")
  async removeProduct(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Keep an inactive supplier override so deleted default SKUs cannot reappear.
    // Save through the same validation and access checks as every catalog edit.
    const result = await this.saveProduct({ ...(input as ManagedProduct), active: false }, req, res);
    const id = result.product.id;
    const [row] = await adminDb("managed_products", `?id=eq.${id}`, "PATCH", { active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!row) throw new HttpException("Varian disembunyikan, tetapi belum berhasil dihapus. Coba lagi.", 503);
    return { product: row, published: result.published };
  }

  @Patch("support/:id")
  async support(@Param("id") id: string, @Body() body: { status?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    this.permit(access, "support.write");
    if (access.categories.length < 5 || access.productSlugs.length) throw new HttpException("Data ini memerlukan akses semua layanan.", 403);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !["new", "in_progress", "closed"].includes(String(body?.status))) throw new HttpException("Status bantuan tidak valid.", 400);
    await this.audit(access.id, "support.update", id);
    const [row] = await adminDb("support_requests", `?id=eq.${id}`, "PATCH", { status: body.status });
    if (!row) throw new HttpException("Permintaan tidak ditemukan.", 404);
    return row;
  }
}
