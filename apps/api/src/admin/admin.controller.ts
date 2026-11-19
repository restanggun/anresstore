import { featuredGameSlugs } from "../catalog/featured-games";
import { isReviewRating } from "../catalog/review-rating";
import { resolveSession, sessionAccessToken, writeSession } from "../auth/session";
import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb, type ManagedProduct } from "./admin-store";
import { CatalogController } from "../catalog/catalog.controller";
import type { CatalogItem } from "../catalog/catalog-mapping";
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
  assistantPatch, assistantPlan, assistantQuota, redactAssistantText, refreshAssistantModelCatalog, type AssistantModelOptions, type AssistantStep, type AssistantTool,
} from "./assistant-model";
import {
  assistantLegacyAgents, assistantLegacySkills, assistantPolicyAllows, assistantRegistryEnabled,
  definitions, loadAssistantRegistry, resolvedRegistry, validateAssistantRegistry, editingTools,
} from "./assistant-registry";
import { tavilyEnabled, tavilySearch } from "./assistant-research";
import { parseAssistantPriceCsv, percentage, targetPrice } from "./assistant-pricing";
import {
  createAssistantSession, deleteAssistantSession, getAssistantMemory, getAssistantSession,
  listAssistantSessions, renameAssistantSession, saveAssistantMemory, saveAssistantTurn,
} from "./assistant-sessions";

const assistantRupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const showCatalogValue = (key: string, value: unknown) => key === "price" || key === "cost_price"
  ? value == null ? "Belum diisi" : assistantRupiah.format(Number(value))
  : key === "active" ? value ? "Tampil" : "Disembunyikan"
  : value == null || value === "" ? "Kosong" : String(value);
type AssistantEvidence = { invoice?: Record<string, unknown>; choices?: unknown[] };
type AssistantOutput = { text: string; section?: string; choices?: unknown[]; proposal?: unknown; batch?: unknown; action?: unknown; sources?: { title: string; url: string; checkedAt: string }[] };

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
    let roleId: string | null = null;
    let superAdmin = allowed.includes(user.id);
    if (!superAdmin) {
      const [assignment] = await adminDb<{ role_id: string | null; is_super: boolean }>("admin_assignments", `?user_id=eq.${encodeURIComponent(user.id)}&select=role_id,is_super&limit=1`);
      if (!assignment) throw new HttpException("Akun ini tidak memiliki akses administrator.", 403);
      superAdmin = assignment.is_super === true;
      if (!superAdmin) {
        if (!assignment.role_id) throw new HttpException("Role admin tidak tersedia.", 403);
        roleId = assignment.role_id;
        const [role] = await adminDb<{ permissions: string[]; categories: string[]; product_slugs: string[] }>("admin_roles", `?id=eq.${encodeURIComponent(assignment.role_id)}&select=permissions,categories,product_slugs&limit=1`);
        if (!role || !Array.isArray(role.permissions) || !Array.isArray(role.categories) || !Array.isArray(role.product_slugs) || role.product_slugs.length > 50 || role.product_slugs.some(s => typeof s !== "string" || s.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) || role.categories.some(c => !["game", "prepaid", "apps", "social", "tasks"].includes(c))) throw new HttpException("Role admin tidak tersedia.", 403);
        permissions = role.permissions; categories = role.categories; productSlugs = role.product_slugs;
      }
    }
    return { id: user.id, superAdmin, permissions, categories, productSlugs, roleId };
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
      if (can("products.write")) tools.push("catalog_edit", "catalog_add", "catalog_manage", "product_rules", "promotion_manage");
      if (assistantRegistryEnabled()) {
        tools.push("pricing", "duplicates", "promo_preview", "content_draft");
        if (can("products.write")) tools.push("pricing_batch");
      }
    }
    if (full && (can("orders.read") || can("payments.read"))) tools.push("transactions");
    if (can("orders.read") && access.categories.includes("tasks")) tools.push("task_orders");
    if (can("orders.read") && access.categories.includes("apps")) tools.push("premium_orders");
    if (full && can("orders.read") && can("payments.read")) tools.push("analytics", "operations", "balances");
    if (full && can("support.read")) tools.push("support", "support_draft");
    if (assistantConfig().attachments) tools.push("file_review");
    if (access.superAdmin) tools.push("vouchers", "voucher_manage");
    if (assistantRegistryEnabled()) {
      tools.push("sop_search");
      if (full && can("support.read")) tools.push("support_handoff");
      if (tavilyEnabled()) tools.push("web_search");
      if (full && can("orders.read") && can("payments.read")) tools.push("invoice_timeline", "reconcile", "finance_category");
    }
    return tools;
  }

  private async assistantCapabilities(access: Awaited<ReturnType<AdminController["authorize"]>>) {
    const registry = assistantRegistryEnabled() ? await loadAssistantRegistry() : resolvedRegistry();
    const tools = this.assistantTools(access).filter(tool => assistantPolicyAllows(registry.skills[tool], access));
    const agents = registry.agents.filter(profile => assistantPolicyAllows(profile, access) && profile.tools.some(tool => tools.includes(tool)));
    return { registry, tools, agents };
  }

  @Get("assistant")
  async assistantStatus(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    await refreshAssistantModelCatalog();
    const { configured, attachments, model, models } = assistantConfig();
    const { tools, agents, registry } = await this.assistantCapabilities(access);
    return { configured, models, defaultModel: configured ? model : undefined, attachments: attachments && (tools.includes("file_review") || tools.includes("pricing_batch")), tools, canManage: access.superAdmin && assistantRegistryEnabled(),
      canManageLanding: access.superAdmin,
      skills: [...tools.filter(tool => tool !== "reply").map(id => ({ id: id as string, label: definitions[id][0] as string, description: definitions[id][1] as string, example: registry.skills[id]?.example })),
        ...(tools.includes("catalog_edit") ? [{ id: "Edit harga", label: "Edit harga", description: "Siapkan draf harga satu SKU." }] : [])],
      agents: agents.map(profile => ({ id: profile.id, label: profile.name, tools: profile.tools.filter(tool => tools.includes(tool)) })),
    };
  }

  @Get("assistant/registry")
  async assistantRegistry(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    if (!access.superAdmin) throw new HttpException("Pengelola Skill & Agent memerlukan super admin.", 403);
    if (!assistantRegistryEnabled()) throw new HttpException("Pengelola Skill & Agent belum diaktifkan.", 503);
    const [registry, roles, runs] = await Promise.all([
      loadAssistantRegistry(),
      adminDb("admin_roles", "?select=id,name&order=name.asc&limit=100"),
      adminDb("admin_assistant_runs", "?select=id,actor_id,steps,created_at&order=created_at.desc&limit=20"),
    ]);
    return { ...registry, roles, runs, definitions: Object.entries(definitions).filter(([id]) => id !== "reply").map(([id, [label, description]]) => ({ id, label, description })), tavily: tavilyEnabled() };
  }

  @Get("storefront/landing")
  async storefrontLanding(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    if (!access.superAdmin) throw new HttpException("Pengaturan landing page memerlukan super admin.", 403);
    const [settings] = await adminDb<{ revision: number; config: Record<string, unknown> }>("storefront_landing_settings", "?id=eq.1&select=revision,config&limit=1");
    if (!settings) throw new HttpException("Terapkan migrasi pengaturan landing page terlebih dahulu.", 503);
    return settings;
  }

  @Post("storefront/landing")
  async saveStorefrontLanding(@Body() raw: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    if (!access.superAdmin) throw new HttpException("Pengaturan landing page memerlukan super admin.", 403);
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const text = (key: string, max: number, min = 0) => {
      const value = body[key];
      if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw new HttpException("Periksa kembali teks pengumuman dan CTA.", 400);
      return value.trim();
    };
    const bool = (key: string) => {
      if (typeof body[key] !== "boolean") throw new HttpException("Pengaturan aktif/nonaktif tidak valid.", 400);
      return body[key] as boolean;
    };
    const date = (key: string) => {
      const value = body[key];
      if (value === null || value === "") return null;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new HttpException("Jadwal banner tidak valid.", 400);
      return new Date(value).toISOString();
    };
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) >= 2147483647)
      throw new HttpException("Versi pengaturan tidak valid.", 400);
    const announcementEnabled = bool("announcementEnabled");
    const announcementText = text("announcementText", 220, announcementEnabled ? 3 : 0);
    const announcementHref = text("announcementHref", 200);
    const announcementLabel = text("announcementLabel", 50);
    if (announcementHref && (!announcementHref.startsWith("/") || announcementHref.startsWith("//") || /[\\?#]/.test(announcementHref)))
      throw new HttpException("Tautan banner hanya boleh menuju path internal Anres.", 400);
    if (announcementHref && announcementLabel.length < 2) throw new HttpException("Isi label tautan banner.", 400);
    const startsAt = date("startsAt");
    const endsAt = date("endsAt");
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new HttpException("Waktu selesai harus setelah waktu mulai.", 400);
    const config = {
      announcementEnabled, announcementText, announcementHref, announcementLabel,
      announcementMoving: bool("announcementMoving"), startsAt, endsAt,
      closingTitle: text("closingTitle", 90, 3), closingBody: text("closingBody", 220, 3),
      showAuthCta: bool("showAuthCta"),
    };
    const [saved] = await adminDb<{ revision: number }>("rpc/save_storefront_landing_settings", "", "POST", {
      p_actor: access.id, p_revision: body.revision, p_config: config,
    });
    if (!saved) throw new HttpException("Pengaturan berubah. Muat ulang sebelum menyimpan.", 409);
    return { revision: saved.revision };
  }

  @Post("assistant/registry")
  async saveAssistantRegistry(@Body() raw: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    if (!access.superAdmin) throw new HttpException("Pengelola Skill & Agent memerlukan super admin.", 403);
    if (!assistantRegistryEnabled()) throw new HttpException("Pengelola Skill & Agent belum diaktifkan.", 503);
    const body = assistantObject(raw);
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) >= 2147483647) {
      throw new HttpException("Versi pengaturan tidak valid.", 400);
    }
    const roles = await adminDb<{ id: string }>("admin_roles", "?select=id&limit=100");
    const config = validateAssistantRegistry(body, roles.map(role => role.id));
    const [result] = await adminDb<{ revision: number }>("rpc/save_admin_assistant_registry", "", "POST", {
      p_actor: access.id, p_revision: body.revision, p_config: config,
    });
    if (!result) throw new HttpException("Pengaturan telah berubah. Muat ulang sebelum menyimpan.", 409);
    return { revision: result.revision };
  }

  @Post("assistant/registry/test")
  async testAssistantRegistry(@Body() raw: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    if (!access.superAdmin) throw new HttpException("Pengujian skill memerlukan super admin.", 403);
    if (!assistantRegistryEnabled() || !assistantConfig().configured) throw new HttpException("Model atau Pengelola Skill & Agent belum aktif.", 503);
    const body = assistantObject(raw);
    const input = assistantInput({ text: body.text, agent: body.agent }, false);
    const { tools, agents, registry } = await this.assistantCapabilities(access);
    const profile = input.agent ? agents.find(agent => agent.id === input.agent) : undefined;
    if (input.agent && !profile) throw new HttpException("Agent tidak tersedia.", 403);
    await assistantQuota(access.id);
    const plans = await assistantPlan(input, tools.filter(tool => tool === "reply" || !profile || profile.tools.includes(tool)), profile, registry.skills);
    return { steps: plans.map(({ tool }) => ({ tool, label: definitions[tool][0] })) };
  }

  @Get("assistant/sessions")
  async assistantSessions(@Query("offset") offset: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    const start = Number(offset ?? 0);
    if (!Number.isSafeInteger(start) || start < 0 || start > 30000) throw new HttpException("Halaman riwayat tidak valid.", 422);
    return listAssistantSessions(access, start);
  }

  @Post("assistant/sessions")
  async newAssistantSession(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return createAssistantSession(await this.authorize(req, res, true, true, true));
  }

  @Get("assistant/sessions/:id")
  async assistantSession(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return getAssistantSession(await this.authorize(req, res, false, true, true), id);
  }

  @Patch("assistant/sessions/:id")
  async updateAssistantSession(@Param("id") id: string, @Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return renameAssistantSession(await this.authorize(req, res, true, true, true), id, assistantObject(body).title);
  }

  @Delete("assistant/sessions/:id")
  async removeAssistantSession(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return deleteAssistantSession(await this.authorize(req, res, true, true, true), id);
  }

  @Get("assistant/memory")
  async assistantMemory(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, false, true, true);
    return getAssistantMemory(access.id);
  }

  @Patch("assistant/memory")
  async updateAssistantMemory(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    return saveAssistantMemory(access.id, assistantObject(body).note);
  }

  @Post("assistant/chat")
  async assistantChat(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    await refreshAssistantModelCatalog();
    const config = assistantConfig();
    if (!config.configured) throw new HttpException("Asisten Anres belum diaktifkan.", 503);
    const input = assistantInput(body, config.attachments);
    const { variantId, sessionId, turnId, model } = assistantObject(body);
    if (model !== undefined && (typeof model !== "string" || !config.models.includes(model))) {
      throw new HttpException("Model AI tidak tersedia untuk Asisten Anres.", 422);
    }
    if (variantId !== undefined && !uuid(variantId)) throw new HttpException("Varian editor tidak valid.", 422);
    if (sessionId !== undefined && (!uuid(sessionId) || !uuid(turnId) || variantId !== undefined)) {
      throw new HttpException("Sesi atau pesan chat tidak valid.", 422);
    }
    const session = typeof sessionId === "string" ? await getAssistantSession(access, sessionId) : undefined;
    const previous = session?.turns.find(turn => turn.id === turnId);
    if (previous) return previous.reply;
    if (session?.revision === 100) throw new HttpException("Sesi sudah berisi 100 giliran. Mulai chat baru untuk melanjutkan.", 409);
    const sentAt = new Date().toISOString();
    const memory = session ? (await getAssistantMemory(access.id)).note : "";
    const usedModels: string[] = [];
    const modelOptions: AssistantModelOptions = { memory, model: typeof model === "string" ? model : config.model,
      onModelUsed: used => { if (!usedModels.includes(used)) usedModels.push(used); } };
    if (session) input.history = session.turns.slice(-3).flatMap(turn => [
      `Admin: ${turn.user.text}`.slice(0, 1500),
      `Asisten: ${turn.reply.text}`.slice(0, 1500),
    ]);
    await assistantQuota(access.id);
    const scopedProduct = variantId === undefined ? null : await this.assistantEditorProduct(access, variantId as string);
    const { registry, tools, agents } = await this.assistantCapabilities(access);
    const profile = input.agent ? agents.find(item => item.id === (Object.hasOwn(assistantLegacyAgents, input.agent) ? assistantLegacyAgents[input.agent] : input.agent) || item.name === input.agent) : undefined;
    if (input.agent && !profile) throw new HttpException("Agent tidak tersedia untuk sesi ini.", 403);
    const selection = input.skills.map(skill => tools.find(tool => tool === skill || definitions[tool][0] === skill ||
      (Object.hasOwn(assistantLegacySkills, skill) && assistantLegacySkills[skill] === tool)));
    if (selection.some(skill => !skill)) throw new HttpException("Skill tidak tersedia untuk sesi ini.", 403);
    if (profile && selection.some(skill => skill && skill !== "file_review" && !profile.tools.includes(skill))) {
      throw new HttpException("Skill pilihan berada di luar cakupan agent.", 403);
    }
    const webRequested = selection.includes("web_search") || profile?.id === "research" || /\b(?:cari di web|tavily|cari di internet|riset publik|pencarian web)\b/i.test(input.text);
    const available = tools.filter(tool => (tool === "reply" || !profile || profile.tools.includes(tool) || tool === "file_review") &&
      (!scopedProduct || tool === "reply" || tool === "catalog_edit") &&
      (tool !== "web_search" || (webRequested && !input.attachments.length)) &&
      (!input.attachments.length || !editingTools.includes(tool)));
    const csv = selection.includes("pricing_batch") && input.attachments.length > 0;
    if (csv && (scopedProduct || !tools.includes("pricing_batch") || profile && !profile.tools.includes("pricing_batch"))) throw new HttpException("Draf CSV di luar cakupan agent.", 403);
    if (input.attachments.length && !csv && !tools.includes("file_review")) throw new HttpException("Analisis lampiran tidak diizinkan.", 403);
    const plan: AssistantStep[] = csv ? [{ tool: "pricing_batch", csv: true }]
      : await assistantPlan({ ...input, skills: selection.filter((skill): skill is AssistantTool => !!skill) }, available, profile, registry.skills, modelOptions);
    const trace: { tool: AssistantTool; label: string; status: string; section?: string }[] = [];
    const evidence: AssistantEvidence = {};
    const outputs: Awaited<ReturnType<AdminController["assistantStep"]>>[] = [];
    for (const step of plan) {
      try {
        const result = await this.assistantStep(step, input, access, req, res, scopedProduct, registry.sops, evidence, modelOptions);
        outputs.push(result);
        trace.push({ tool: step.tool, label: definitions[step.tool][0], status: result.proposal || result.batch || result.action ? "review" : "done", section: result.section });
      } catch (error) {
        trace.push({ tool: step.tool, label: definitions[step.tool][0], status: "failed" });
        if (!outputs.length) {
          await this.logAssistantRun(access.id, trace);
          throw error;
        }
        outputs.push({ text: error instanceof HttpException ? error.message : "Langkah berikutnya belum berhasil dijalankan." });
        break;
      }
    }
    await this.logAssistantRun(access.id, trace);
    const last = outputs.at(-1)!;
    const reply = { ...last, text: outputs.map(result => result.text).join("\n\n"),
      model: csv ? undefined : usedModels.length ? usedModels.map(id => id.replace(/^groq::/, "Groq · ").replace(/^google::/, "Google AI Studio · ")).join(" → ") : modelOptions.model,
      section: [...outputs].reverse().find(result => result.section)?.section,
      choices: [...outputs].reverse().find(result => result.choices?.length)?.choices,
      sources: outputs.flatMap(result => result.sources ?? []),
      trace,
    };
    if (session && typeof turnId === "string") {
      const answeredAt = new Date().toISOString();
      await saveAssistantTurn(access, session, {
        id: turnId, user: { text: input.text, sentAt },
        reply: { text: redactAssistantText(reply.text), sentAt: answeredAt, section: reply.section, sources: reply.sources, model: reply.model },
      });
      return { ...reply, sentAt: answeredAt };
    }
    return reply;
  }

  private async logAssistantRun(actor: string, steps: { tool: AssistantTool; label: string; status: string; section?: string }[]) {
    if (assistantRegistryEnabled()) await adminDb("admin_assistant_runs", "", "POST", { id: randomUUID(), actor_id: actor, steps });
  }

  private async assistantStep(
    plan: AssistantStep, input: ReturnType<typeof assistantInput>, access: Awaited<ReturnType<AdminController["authorize"]>>,
    req: Request, res: Response, scopedProduct: ManagedProduct | null, sops: ReturnType<typeof resolvedRegistry>["sops"],
    evidence: AssistantEvidence, modelOptions: AssistantModelOptions,
  ): Promise<AssistantOutput> {
    const arg = (key: string) => (plan as Record<string, unknown>)[key];

    switch (plan.tool) {
      case "reply": {
        const text = arg("text");
        if (typeof text !== "string" || !text.trim() || text.length > 1500) {
          return { text: await assistantAnswer(input.text, "reply", { history: input.history }, modelOptions) };
        }
        return { text: redactAssistantText(text.trim()) };
      }
      case "catalog_search": {
        const range = input.text.match(/\b(\d{1,6})\s*(?:-|–|sampai|hingga)\s*(\d{1,6})\b/i);
        const result = await this.assistantCatalog(access, arg("query") ?? "", arg("category"), null, {
          product: arg("product"), minAmount: arg("minAmount") ?? range?.[1], maxAmount: arg("maxAmount") ?? range?.[2],
        });
        if ("choices" in result) evidence.choices = result.choices;
        return result;
      }
      case "catalog_edit":
        return scopedProduct ? this.draftAssistantProduct(access, scopedProduct, assistantPatch(arg("patch")))
          : this.assistantCatalog(access, arg("query"), arg("category"), assistantPatch(arg("patch")), {
            product: arg("product"), minAmount: arg("minAmount") ?? input.text.match(/\b(\d{1,6})\s*(?:-|–|sampai|hingga)\s*(\d{1,6})\b/i)?.[1],
            maxAmount: arg("maxAmount") ?? input.text.match(/\b(\d{1,6})\s*(?:-|–|sampai|hingga)\s*(\d{1,6})\b/i)?.[2],
            batch: arg("batch") === true || /\b(semua|seluruh|tiap|setiap|massal|batch|rentang|range|antara)\b|\b\d{1,6}\s*(?:-|–|sampai|hingga)\s*\d{1,6}\b/i.test(input.text),
          });
      case "catalog_add":
        return this.assistantCatalogAdd(access, plan);
      case "catalog_manage":
        return this.assistantCatalogManage(access, plan, input.text);
      case "product_rules":
        return this.assistantProductRulesDraft(access, plan);
      case "promotion_manage":
        return this.assistantPromotionDraft(access, plan);
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
        const required = ["paidCount", "paidAmount", "pendingCount", "failedCount", "refundedCount", "historicalCount", "unknownCostCount"];
        if (required.some(key => !Number.isFinite(summary[key]))) throw new HttpException("Ringkasan transaksi belum lengkap.", 503);
        return { text: `Ringkasan ${days} hari (WIB)\n${summary.paidCount} penjualan lunas, omzet ${assistantRupiah.format(Number(summary.paidAmount))}.\nAktivitas pembayaran: ${summary.pendingCount} menunggu, ${summary.failedCount} gagal, kedaluwarsa, atau batal, dan ${summary.refundedCount} refund.\nPenjualan historis: ${summary.historicalCount}. Penjualan tanpa data modal: ${summary.unknownCostCount}.`, section: "reports" };
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
      case "support_handoff":
        return { text: await assistantAnswer(input.text, plan.tool, { context: "Situasi anonim yang dijelaskan admin", attachments: input.attachments, verified: evidence.invoice }, modelOptions), section: "conversations" };
      case "content_draft":
        if (!evidence.choices?.length) return { text: "Tentukan varian yang ingin dijadikan sumber draf konten.", section: "catalog" };
        return { text: await assistantAnswer(input.text, plan.tool, { variants: evidence.choices }, modelOptions), section: "catalog" };
      case "pricing":
      case "duplicates":
      case "promo_preview":
      case "pricing_batch":
        return this.assistantPricing(access, plan, input);
      case "invoice_timeline":
      case "reconcile":
        return this.assistantInvoice(access, plan, input.text, evidence);
      case "finance_category":
        return this.assistantFinance(plan.days);
      case "sop_search": {
        if (typeof plan.query !== "string" || plan.query.trim().length < 3 || plan.query.length > 120) throw new HttpException("Tulis topik SOP yang ingin dicari.", 422);
        const words = plan.query.toLowerCase().split(/\W+/).filter(word => word.length > 2);
        const matches = sops.filter(sop => words.some(word => (sop.title + " " + sop.body).toLowerCase().includes(word))).slice(0, 3);
        return { text: matches.length ? matches.map(sop => `${sop.title}\n${sop.body}`).join("\n\n") : "SOP yang cocok belum tersedia." };
      }
      case "web_search": {
        const { query, checkedAt, results } = await tavilySearch(plan.query, input.text);
        if (!results.length) return { text: "Tavily belum menemukan sumber publik yang cocok." };
        const sourceExcerpts = results.slice(0, 3).map(({ title, excerpt }) => ({ title, excerpt: excerpt.slice(0, 350) }));
        let text: string;
        try {
          text = await assistantAnswer(query, plan.tool, sourceExcerpts, modelOptions);
        } catch (error) {
          if (!(error instanceof HttpException)) throw error;
          text = "Tavily menemukan sumber berikut. Ringkasan AI sedang tidak tersedia.";
        }
        return { text, sources: results.map(({ title, url }) => ({ title, url, checkedAt })) };
      }
      case "file_review":
        if (!input.attachments.length) return { text: "Lampirkan file teks untuk dianalisis." };
        return { text: await assistantAnswer(input.text, plan.tool, { attachments: input.attachments }, modelOptions) };
      case "vouchers": {
        const { rows, hasMore } = await this.vouchers("0", req, res);
        return { text: `${rows.length} voucher pada halaman pertama${hasMore ? ", masih ada halaman berikutnya" : ""}. Buka Voucher untuk melihat kode dan pengaturannya.`, section: "vouchers" };
      }
      case "voucher_manage":
        return this.assistantVoucherDraft(access, plan, input.text);
    }
  }

  private async assistantPricing(
    access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep, input: ReturnType<typeof assistantInput>,
  ): Promise<AssistantOutput> {
    const csv = plan.csv === true && input.attachments.length > 0;
    if (plan.csv === true && !csv) throw new HttpException("Lampiran CSV diperlukan.", 422);
    if (plan.tool === "pricing_batch" && !/\b(draf|draft|siapkan|usulkan|rancangan)\b/i.test(input.text)) {
      throw new HttpException("Minta draf harga secara eksplisit sebelum menyiapkan perubahan massal.", 422);
    }
    const category = plan.category;
    if ((!csv || category !== undefined) && !assistantCategories.some(item => item === category)) throw new HttpException("Pilih kategori katalog yang valid.", 422);
    if (typeof category === "string") this.category(access, category);
    this.permit(access, "products.read");
    if (plan.tool === "pricing_batch") this.permit(access, "products.write");
    const scope = access.productSlugs.length ? `&product_slug=in.(${access.productSlugs.join(",")})` : "";
    const categories = access.categories.filter(item => !category || item === category);
    if (!categories.length) throw new HttpException("Kategori katalog tidak tersedia.", 403);
    const catalog = await adminDb<ManagedProduct>("managed_products",
      `?category=in.(${categories.join(",")})${scope}&deleted_at=is.null&select=id,category,product,product_slug,name,provider_code,price,cost_price,active,updated_at&order=id.asc&limit=501`);
    if (catalog.length > 500) throw new HttpException("Pilih kategori atau cakupan katalog yang lebih kecil untuk analisis.", 422);
    if (plan.query !== undefined && (typeof plan.query !== "string" || plan.query.length > 120)) throw new HttpException("Kata kunci katalog tidak valid.", 422);
    const query = typeof plan.query === "string" ? plan.query.trim().toLowerCase() : "";
    if (!csv && ["pricing_batch", "promo_preview"].includes(plan.tool) && !query) throw new HttpException("Sebutkan nama produk atau SKU.", 422);
    const words = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const selected = catalog.filter(row => !query || row.provider_code.toLowerCase() === query || (words.length > 0 && words.every(word =>
      `${row.name} ${row.product} ${row.provider_code}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).some(item => /\d/.test(word) ? item === word : item.includes(word)))));
    const money = (value: number) => assistantRupiah.format(value);
    const margin = (row: ManagedProduct, price = Number(row.price)) => (price - Number(row.cost_price)) * 100 / price;
    const hasCost = (row: ManagedProduct) => row.cost_price != null && Number(row.cost_price) > 0;
    const below = plan.below === undefined ? undefined : percentage(plan.below, 100);
    if (plan.tool === "duplicates") {
      const groups = new Map<string, ManagedProduct[]>();
      for (const row of selected) {
        const key = `${row.category}/${row.product_slug}/${row.name.normalize("NFKC").trim().toLowerCase()}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const duplicates = [...groups.values()].filter(group => group.length > 1);
      return { text: `${duplicates.length} kelompok nama varian sama dari ${selected.length} varian tersimpan.` +
        duplicates.slice(0, 8).map(group => `\n${group[0]!.name}: ${group.slice(0, 8).map(row => row.provider_code).join(", ")}`).join(""), section: "catalog" };
    }
    if (plan.tool === "promo_preview") {
      if (selected.length !== 1) return { text: "Pilih satu SKU untuk simulasi promo.", choices: selected.slice(0, 8).map(row => this.assistantCatalogChoice(row)), section: "catalog" };
      const row = selected[0]!;
      const discount = percentage(plan.discount);
      const price = Math.max(1, Math.ceil(Number(row.price) * (10000 - Math.round(discount * 100)) / 10000));
      return { text: `Simulasi ${row.provider_code}: ${money(Number(row.price))} → ${money(price)} (diskon ${discount}%). ` +
        (hasCost(row) ? `Estimasi margin setelah diskon ${margin(row, price).toFixed(2)}%.` : "Modal tercatat belum tersedia."), section: "catalog" };
    }
    const withCost = selected.filter(row => hasCost(row) && (below === undefined || margin(row) < below));
    if (plan.tool === "pricing") {
      return { text: `${withCost.length} varian sesuai filter dari ${selected.length} varian tersimpan. ${selected.filter(row => !hasCost(row)).length} varian tanpa modal positif.` +
        withCost.slice(0, 12).map(row => `\n${row.provider_code}: jual ${money(Number(row.price))}, modal ${money(Number(row.cost_price))}, margin ${margin(row).toFixed(2)}%, markup ${((Number(row.price) / Number(row.cost_price) - 1) * 100).toFixed(2)}%.`).join(""), section: "catalog" };
    }
    let staged: { row: ManagedProduct; price: number }[];
    if (csv) {
      const [file] = input.attachments;
      if (input.attachments.length !== 1 || !file?.name.toLowerCase().endsWith(".csv")) throw new HttpException("Gunakan satu lampiran CSV harga.", 422);
      staged = parseAssistantPriceCsv(file.text).map(({ sku, price }) => {
        const matches = catalog.filter(row => row.provider_code.toLowerCase() === sku.toLowerCase());
        if (matches.length !== 1) throw new HttpException(`SKU ${sku} tidak tersedia atau ambigu dalam cakupan katalog.`, 422);
        return { row: matches[0]!, price };
      });
    } else {
      const mode = plan.mode;
      if (mode !== "margin" && mode !== "markup") throw new HttpException("Tentukan target margin atau markup.", 422);
      const target = percentage(plan.target, mode === "markup" ? 500 : 95);
      staged = withCost.map(row => ({ row, price: targetPrice(Number(row.cost_price), target, mode) }));
    }
    const changes = staged.filter(({ row, price }) => Number(row.price) !== price);
    if (!changes.length) return { text: "Tidak ada harga yang perlu diubah pada filter ini.", section: "catalog" };
    if (changes.length > 50 || changes.some(({ row, price }) => !row.updated_at || price < 1 || price > 100000000)) {
      throw new HttpException("Batasi draf ke 50 varian dengan harga valid. Persempit filter atau periksa modal.", 422);
    }
    const id = randomUUID();
    const [entry] = await adminDb<{ expires_at: string }>("rpc/stage_admin_assistant_batch", "", "POST", {
      p_id: id, p_actor: access.id, p_items: changes.map(({ row, price }) => ({
        id: randomUUID(), product_id: row.id, category: row.category, product_slug: row.product_slug,
        product_version: row.updated_at, before_price: Number(row.price), after_price: price,
      })),
    });
    if (!entry?.expires_at) throw new HttpException("Draf harga massal belum dapat disimpan.", 503);
    return { text: `Tinjau perubahan ${changes.length} varian. Promo aktif dapat memengaruhi harga yang terlihat pelanggan.`, section: "catalog",
      batch: { id, expiresAt: entry.expires_at, rows: changes.map(({ row, price }) => ({ ...this.assistantCatalogChoice(row), after: price })) } };
  }

  private async assistantInvoice(
    access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep, prompt: string, evidence: AssistantEvidence,
  ): Promise<AssistantOutput> {
    this.permit(access, "orders.read"); this.permit(access, "payments.read"); this.allServices(access);
    const invoice = plan.invoice;
    if (typeof invoice !== "string" || !/^ANRS-[A-Z0-9-]{4,50}$/i.test(invoice) || !prompt.toLowerCase().includes(invoice.toLowerCase())) {
      throw new HttpException("Tulis nomor invoice ANRS lengkap di pesan terbaru.", 422);
    }
    const [row] = await adminDb("admin_transaction_records",
      `?invoice_number=ilike.${encodeURIComponent(invoice)}&select=id,source,created_at,updated_at,amount,payment_status,fulfillment_status&limit=1`);
    if (!row) return { text: "Invoice tidak ditemukan dalam transaksi produksi.", section: "orders" };
    evidence.invoice = { amount: row.amount, payment_status: row.payment_status, fulfillment_status: row.fulfillment_status, created_at: row.created_at, updated_at: row.updated_at };
    if (plan.tool === "invoice_timeline") {
      const events = typeof row.id === "string" && uuid(row.id) && row.source === "checkout"
        ? await adminDb("payment_audit_events", `?payment_id=eq.${row.id}&select=created_at,next_status&order=created_at.asc&limit=20`) : [];
      return { text: `${invoice.toUpperCase()}\nDibuat: ${row.created_at}.\nPembayaran: ${row.payment_status}. Pemenuhan: ${row.fulfillment_status}.\nPembaruan terakhir: ${row.updated_at ?? "tidak tersedia"}.` +
        events.map(event => `\n${event.created_at}: ${event.next_status}`).join(""), section: "orders" };
    }
    if (row.source !== "checkout" || !uuid(row.id)) return { text: "Invoice ini bukan transaksi Tripay yang bisa dicocokkan lewat gateway.", section: "payments" };
    const [payment] = await adminDb("payments", `?id=eq.${row.id}&payment_mode=eq.live&select=id,merchant_ref,reference,amount,method,status&limit=1`);
    if (!payment || typeof payment.reference !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(payment.reference)) {
      return { text: "Referensi Tripay belum tersedia untuk invoice ini.", section: "payments" };
    }
    const gateway = await new TripayClient().detail(payment.reference);
    if (gateway.reference !== payment.reference || gateway.merchant_ref !== (payment.merchant_ref ?? payment.id) || gateway.payment_method !== payment.method ||
      !["UNPAID", "PAID", "FAILED", "EXPIRED", "REFUND"].includes(gateway.status) ||
      !Number.isSafeInteger(gateway.amount) || !Number.isSafeInteger(gateway.fee_customer) || gateway.fee_customer < 0 || gateway.amount < gateway.fee_customer) {
      throw new HttpException("Identitas atau nominal transaksi Tripay belum dapat diverifikasi.", 409);
    }
    const total = Number(gateway.amount) - Number(gateway.fee_customer);
    const state = gateway.status.toUpperCase() === "UNPAID" ? "pending" : gateway.status.toUpperCase() === "REFUND" ? "refunded" : gateway.status.toLowerCase();
    return { text: `${invoice.toUpperCase()}: Anres ${payment.status} / ${assistantRupiah.format(Number(payment.amount))}. Tripay ${gateway.status} / ${assistantRupiah.format(total)} sebelum biaya pelanggan. ` +
      (state === payment.status && total === Number(payment.amount) ? "Status dan nominal cocok." : "Ada selisih yang perlu ditinjau di dashboard."), section: "payments" };
  }

  private async assistantFinance(days: unknown): Promise<AssistantOutput> {
    days ??= 7;
    if (![7, 30, 90, "7", "30", "90"].includes(days as number | string)) throw new HttpException("Gunakan periode 7, 30, atau 90 hari.", 422);
    const records = await adminDb("rpc/admin_assistant_finance_by_category", "", "POST", { p_days: Number(days) });
    return { text: `Omzet ${days} hari kalender (WIB), transaksi lunas.` +
      (records.length ? records.map(row => `\n${row.category}: ${row.paid_count} transaksi, omzet ${assistantRupiah.format(Number(row.revenue))}, keuntungan tercatat ${assistantRupiah.format(Number(row.profit))}, margin ${Number(row.known_revenue) > 0 ? (100 * Number(row.profit) / Number(row.known_revenue)).toFixed(2) + "%" : "belum tersedia"} atas transaksi dengan modal diketahui. ${row.missing_cost} transaksi tanpa modal.`).join("") : " Belum ada transaksi lunas."), section: "reports" };
  }

  @Post("assistant/batches/:id/apply")
  async assistantApplyBatch(@Param("id") id: string, @Body() raw: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    const tools = (await this.assistantCapabilities(access)).tools;
    if (!assistantConfig().configured || !tools.some(tool => ["pricing_batch", "catalog_edit"].includes(tool))) {
      throw new HttpException("Konfirmasi draf massal tidak tersedia untuk sesi ini.", 403);
    }
    const body = assistantObject(raw);
    if (!uuid(id) || body.confirm !== true || Object.keys(body).length !== 1) throw new HttpException("Konfirmasi tidak valid.", 400);
    const [batch] = await adminDb<{ proposal_ids: string[] }>("admin_assistant_batches", `?id=eq.${id}&actor_id=eq.${access.id}&select=proposal_ids`);
    if (!batch?.proposal_ids.length || batch.proposal_ids.length > 50 || !batch.proposal_ids.every(uuid)) throw new HttpException("Draf massal tidak ditemukan.", 404);
    const entries = await adminDb<{ category: string; product_slug: string }>("admin_assistant_proposals",
      `?id=in.(${batch.proposal_ids.join(",")})&actor_id=eq.${access.id}&select=category,product_slug`);
    if (entries.length !== batch.proposal_ids.length) throw new HttpException("Draf massal tidak lengkap.", 409);
    for (const entry of entries) { this.category(access, entry.category); this.product(access, entry.product_slug); }
    const [result] = await adminDb<{ result: string }>("rpc/apply_admin_assistant_batch", "", "POST", { p_id: id, p_actor: access.id });
    if (result?.result !== "applied") throw new HttpException(result?.result === "expired" ? "Draf massal kedaluwarsa." : "Draf massal sudah berubah. Buat draf baru.", 409);
    return { ok: true, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Post("assistant/actions/:id/apply")
  async assistantApplyAction(@Param("id") id: string, @Body() raw: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true, true, true);
    const body = assistantObject(raw);
    if (!uuid(id) || body.confirm !== true || Object.keys(body).length !== 1) throw new HttpException("Konfirmasi perubahan tidak valid.", 400);
    const [draft] = await adminDb<{ action_type: string; payload: Record<string, unknown>; expires_at: string; applied_at: string | null }>(
      "admin_assistant_action_drafts", `?id=eq.${id}&actor_id=eq.${access.id}&select=action_type,payload,expires_at,applied_at&limit=1`);
    if (!draft) throw new HttpException("Draf tidak ditemukan atau bukan milik akun ini.", 404);
    if (draft.applied_at) return { ok: true, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
    if (Date.parse(draft.expires_at) <= Date.now()) throw new HttpException("Draf kedaluwarsa. Siapkan draf baru.", 409);
    const tools = (await this.assistantCapabilities(access)).tools;
    const requiredTool = draft.action_type === "product_create" ? "catalog_add"
      : draft.action_type === "product_batch" ? (draft.payload.fullConfig === true || tools.includes("catalog_manage") ? "catalog_manage" : "catalog_edit")
      : ["product_save", "product_remove"].includes(draft.action_type) ? "catalog_manage"
      : ["task_rule_save", "premium_rule_save"].includes(draft.action_type) ? "product_rules"
      : draft.action_type === "promotion_save" ? "promotion_manage"
      : draft.action_type === "voucher_save" ? "voucher_manage" : "";
    if (!assistantConfig().configured || !requiredTool || !tools.includes(requiredTool as AssistantTool)) {
      throw new HttpException("Draf ini tidak lagi tersedia untuk izin sesi admin.", 403);
    }
    const payload = assistantObject(draft.payload);
    let published = process.env.ADMIN_CATALOG_ENABLED === "true";
    if (["product_create", "product_save", "product_batch"].includes(draft.action_type)) {
      const products = draft.action_type === "product_batch" ? payload.items : [payload.product ?? payload];
      if (!Array.isArray(products) || !products.length || products.length > 50) throw new HttpException("Draf produk tidak valid.", 409);
      this.permit(access, "products.read"); this.permit(access, "products.write");
      for (const value of products) {
        const productDraft = assistantObject(value);
        const category = productDraft.category, productSlug = productDraft.product_slug;
        if (typeof category !== "string" || typeof productSlug !== "string") throw new HttpException("Draf produk tidak valid.", 409);
        const expectedVersion = productDraft.assistant_expected_version;
        delete productDraft.assistant_expected_version;
        if (typeof expectedVersion === "string") {
          const [current] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${encodeURIComponent(String(productDraft.id))}&select=id,updated_at,category,product_slug,provider,provider_code,product,section,name,price,cost_price,description,active,fulfillment_mode,supplier_code,service_quantity&limit=1`);
          if (!current) throw new HttpException("Varian tidak ditemukan. Periksa katalog dan siapkan draf baru.", 409);
          this.category(access, current.category); this.product(access, current.product_slug);
          const fields = ["provider", "provider_code", "category", "product", "product_slug", "section", "name", "price", "cost_price", "description", "active", "fulfillment_mode", "supplier_code", "service_quantity"] as const;
          const alreadyApplied = fields.every(key => (current[key] ?? null) === ((productDraft as Record<string, unknown>)[key] ?? null));
          if (current.updated_at !== expectedVersion && !alreadyApplied) throw new HttpException("Varian berubah sejak draf dibuat. Periksa katalog dan siapkan draf baru.", 409);
          if (alreadyApplied) continue;
        }
        this.category(access, category); this.product(access, productSlug);
        const result = await this.saveProduct(productDraft, req, res);
        published = result.published;
      }
    } else if (draft.action_type === "product_remove") {
      this.permit(access, "products.read"); this.permit(access, "products.write");
      const productDraft = assistantObject(payload.product);
      const category = productDraft.category, productSlug = productDraft.product_slug;
      if (typeof category !== "string" || typeof productSlug !== "string") throw new HttpException("Draf hapus varian tidak valid.", 409);
      this.category(access, category); this.product(access, productSlug);
      if (typeof payload.expectedVersion === "string") {
        const [current] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${encodeURIComponent(String(productDraft.id))}&select=id,updated_at,active,deleted_at&limit=1`);
        if (!current) throw new HttpException("Varian tidak ditemukan. Periksa katalog dan siapkan draf baru.", 409);
        if (current.updated_at !== payload.expectedVersion && !(current.deleted_at && !current.active)) throw new HttpException("Varian berubah sejak draf dibuat. Periksa katalog dan siapkan draf baru.", 409);
        if (current.deleted_at && !current.active) published = process.env.ADMIN_CATALOG_ENABLED === "true";
        else { const result = await this.removeProduct(productDraft, req, res); published = result.published; }
      } else {
        const result = await this.removeProduct(productDraft, req, res);
        published = result.published;
      }
    } else if (draft.action_type === "task_rule_save") {
      const productId = payload.product_id;
      if (typeof productId !== "string") throw new HttpException("Draf tarif tugas tidak valid.", 409);
      const save = await this.assertAssistantRuleDraft(access, productId, "tasks", payload.product_expected_version, payload.rule_expected_version, "task_price_rules", payload.rule);
      if (save) await this.saveTaskPricing(productId, payload.rule, req, res);
      published = process.env.ADMIN_CATALOG_ENABLED === "true";
    } else if (draft.action_type === "premium_rule_save") {
      const productId = payload.product_id;
      if (typeof productId !== "string") throw new HttpException("Draf aturan premium tidak valid.", 409);
      const rule = assistantObject(payload.rule);
      const save = await this.assertAssistantRuleDraft(access, productId, "apps", payload.product_expected_version, payload.rule_expected_version, "premium_product_rules", rule);
      if (save) await this.savePremiumRules(productId, {
        access_type: rule.access_type, duration_days: rule.duration_days, guarantee_days: rule.guarantee_days, guarantee_terms: rule.guarantee_terms,
      }, req, res);
      published = process.env.ADMIN_CATALOG_ENABLED === "true";
    } else if (draft.action_type === "promotion_save") {
      const category = payload.category, itemCode = payload.item_code;
      if (typeof category !== "string" || typeof itemCode !== "string") throw new HttpException("Draf promo tidak valid.", 409);
      this.permit(access, "products.read"); this.permit(access, "products.write"); this.category(access, category);
      const result = await this.savePromotion(payload, req, res);
      published = result.published;
    } else {
      const voucherAccess = await this.voucherAdmin(req, res, true);
      const operation = payload.operation;
      const voucherId = payload.id;
      const version = payload.version;
      const settings = parseVoucherSettings(payload.settings);
      if (typeof voucherId !== "string" || !voucherUuid.test(voucherId) || !Number.isSafeInteger(version) || Number(version) < 1) {
        throw new HttpException("Draf voucher tidak valid.", 409);
      }
      if (settings.active && settings.product_slug && settings.category) {
        const source = await this.catalogReader.list(settings.category, true);
        if (!source.items.some(item => item.productSlug === settings.product_slug && (!settings.variant_code || item.code === settings.variant_code))) {
          throw new HttpException("Produk target voucher sudah tidak tersedia. Periksa katalog sebelum mencoba lagi.", 409);
        }
      }
      if (operation === "create") {
        const [existing] = await this.voucherStore.request<{ id: string }[]>(`vouchers?id=eq.${voucherId}&select=id&limit=1`);
        if (!existing) {
          await this.audit(voucherAccess.id, "voucher.create", voucherId);
          const [saved] = await this.voucherStore.request<Record<string, unknown>[]>("vouchers?on_conflict=id", "POST", {
            ...settings, id: voucherId, version: 1, updated_at: new Date().toISOString(),
          });
          if (!saved) throw new HttpException("Voucher belum berhasil dibuat.", 503);
        }
      } else if (operation === "update") {
        await this.audit(voucherAccess.id, "voucher.update", voucherId);
        const rows = await this.voucherStore.request<Record<string, unknown>[]>(`vouchers?id=eq.${voucherId}&version=eq.${Number(version)}`, "PATCH", {
          ...settings, version: Number(version) + 1, updated_at: new Date().toISOString(),
        });
        if (!rows[0]) throw new HttpException("Voucher berubah sejak draf dibuat. Muat ulang dan siapkan draf baru.", 409);
      } else throw new HttpException("Jenis perubahan voucher tidak dikenal.", 409);
      published = true;
    }
    const updated = await adminDb("admin_assistant_action_drafts", `?id=eq.${id}&actor_id=eq.${access.id}&applied_at=is.null`, "PATCH", { applied_at: new Date().toISOString() });
    if (!updated.length) {
      const [current] = await adminDb<{ applied_at: string | null }>("admin_assistant_action_drafts", `?id=eq.${id}&actor_id=eq.${access.id}&select=applied_at&limit=1`);
      if (!current?.applied_at) throw new HttpException("Perubahan tersimpan tetapi status draf belum tercatat. Muat ulang sebelum mencoba lagi.", 503);
    }
    return { ok: true, published };
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

  private async createAssistantActionDraft(access: Awaited<ReturnType<AdminController["authorize"]>>,
    actionType: "product_create" | "product_save" | "product_remove" | "product_batch" | "task_rule_save" | "premium_rule_save" | "promotion_save" | "voucher_save", payload: Record<string, unknown>, title: string, summary: string,
    changes?: { label: string; before: string; after: string }[]) {
    const id = randomUUID();
    const [row] = await adminDb<{ expires_at: string }>("admin_assistant_action_drafts", "", "POST", {
      id, actor_id: access.id, action_type: actionType, payload,
    });
    if (!row?.expires_at) throw new HttpException("Draf perubahan belum dapat disimpan.", 503);
    return { text: "Draf sudah disiapkan. Periksa rincian lalu pilih Terapkan untuk menyimpan.", section: actionType === "voucher_save" ? "vouchers" : actionType === "task_rule_save" ? "tasks" : actionType === "premium_rule_save" ? "apps" : "catalog",
      action: { id, expiresAt: row.expires_at, title, summary, ...(changes?.length ? { changes } : {}) } };
  }

  private async assertAssistantRuleDraft(access: Awaited<ReturnType<AdminController["authorize"]>>, productId: string, category: "tasks" | "apps",
    expectedProductVersion: unknown, expectedRuleVersion: unknown, table: "task_price_rules" | "premium_product_rules", desiredRule: unknown): Promise<boolean> {
    if (!uuid(productId) || typeof expectedProductVersion !== "string") throw new HttpException("Draf aturan produk tidak valid.", 409);
    const [product] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${productId}&category=eq.${category}&select=id,provider,updated_at,product_slug&limit=1`);
    if (!product || product.provider !== "manual" || product.updated_at !== expectedProductVersion) throw new HttpException("Produk berubah sejak draf dibuat. Periksa produk dan siapkan draf baru.", 409);
    this.category(access, category); this.product(access, product.product_slug);
    const [current] = await adminDb<Record<string, unknown>>(table, `?product_id=eq.${productId}&select=*&limit=1`);
    const expectedFields = category === "tasks"
      ? ["pricing_unit", "base_fee", "price_per_page", "price_per_revision", "rush_fee_per_day", "standard_days", "max_pages", "max_revisions"]
      : ["access_type", "duration_days", "guarantee_days", "guarantee_terms"];
    const target = assistantObject(desiredRule);
    const alreadyApplied = !!current && expectedFields.every(key => (current[key] ?? null) === (target[key] ?? null));
    const sameVersion = expectedRuleVersion === null ? !current : typeof expectedRuleVersion === "string" && current?.updated_at === expectedRuleVersion;
    if (!sameVersion) {
      if (alreadyApplied) return false;
      throw new HttpException("Aturan produk berubah sejak draf dibuat. Baca ulang aturan dan siapkan draf baru.", 409);
    }
    return true;
  }

  private assistantProviderPayload(row: ManagedProduct, patch: ReturnType<typeof assistantPatch>, item: CatalogItem): ManagedProduct {
    return {
      id: row.id || randomUUID(), provider: "vipayment", provider_code: row.provider_code, category: row.category,
      product: row.product, product_slug: row.product_slug, section: row.section ?? item.section ?? null,
      name: patch.name ?? row.name, price: patch.price ?? Number(row.price),
      cost_price: row.cost_price ?? item.providerCost ?? null,
      description: patch.description ?? row.description ?? item.description ?? "",
      active: patch.active ?? row.active, fulfillment_mode: row.fulfillment_mode ?? (item.requiresManualReview ? "manual" : "vipayment"),
      supplier_code: row.supplier_code ?? item.code,
      service_quantity: row.service_quantity ?? (row.category === "social" ? item.minimum ?? item.serviceQuantity ?? 1 : item.serviceQuantity ?? 1),
    };
  }

  private async assistantCatalogAdd(access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep): Promise<AssistantOutput> {
    const category = assistantCategories.find(value => value === plan.category);
    const sku = plan.query;
    const price = plan.price;
    if (!category ||
        typeof sku !== "string" || !sku.trim() || sku.length > 200 || /[<>\u0000-\u001f]/.test(sku) ||
        !Number.isSafeInteger(price) || Number(price) < 1 || Number(price) > 100000000) {
      throw new HttpException("Untuk menambah produk, sebutkan kategori, SKU provider persis, dan harga jual rupiah.", 422);
    }
    this.permit(access, "products.read"); this.permit(access, "products.write"); this.category(access, category);
    const source = await this.catalogReader.list(category, true);
    const matches = source.items.filter(row => row.code.toLowerCase() === sku.trim().toLowerCase() || row.name.trim().toLowerCase() === sku.trim().toLowerCase());
    if (matches.length > 1) return { text: "Nama itu cocok dengan beberapa SKU. Kirim kode provider yang tepat.", choices: matches.slice(0, 20).map(row => ({ name: row.name, product: row.product, sku: row.code, category, price: row.price, active: true })), section: "catalog" };
    const item = matches[0];
    if (!item) return { text: "SKU itu tidak ditemukan pada katalog provider yang tersedia. Gunakan Cari produk atau impor varian dari dashboard terlebih dahulu.", section: "catalog" };
    this.product(access, item.productSlug);
    const [existing] = await adminDb<ManagedProduct>("managed_products", `?provider=eq.vipayment&category=eq.${category}&provider_code=eq.${encodeURIComponent(item.code)}&select=id,active,deleted_at&limit=1`);
    if (existing) return { text: existing.active && !existing.deleted_at ? `Varian ${item.name} sudah ada dan aktif. Gunakan Kelola katalog untuk mengubahnya.` : `Varian ${item.name} sudah tercatat tetapi disembunyikan. Gunakan Kelola katalog dengan tindakan show atau restore.`, section: "catalog" };
    const fulfillmentMode = item.requiresManualReview ? "manual" : "vipayment";
    const quantity = category === "social" ? item.minimum ?? item.serviceQuantity ?? 1 : item.serviceQuantity ?? 1;
    const payload: ManagedProduct = {
      id: randomUUID(), provider: "vipayment", provider_code: item.code, category, product: item.product,
      product_slug: item.productSlug, section: item.section ?? null, name: item.name, price: Number(price),
      cost_price: item.providerCost ?? null, description: item.description ?? "", active: true,
      fulfillment_mode: fulfillmentMode, supplier_code: item.code, service_quantity: quantity,
    };
    return this.createAssistantActionDraft(access, "product_create", payload,
      `Tambah ${item.name}`, `${item.product} · ${item.code} · harga ${assistantRupiah.format(Number(price))}`);
  }

  private async assistantCatalogManage(access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep, prompt: string): Promise<AssistantOutput> {
    const category = plan.category;
    const action = String(plan.action ?? "edit").toLowerCase();
    const settings = plan.settings === undefined ? {} : assistantObject(plan.settings);
    const allowed = new Set(["provider", "provider_code", "product", "product_slug", "section", "name", "price", "cost_price", "description", "active", "fulfillment_mode", "supplier_code", "service_quantity"]);
    if (typeof category !== "string" || !assistantCategories.includes(category as typeof assistantCategories[number]) ||
        !["add", "edit", "hide", "show", "restore", "move", "delete"].includes(action) ||
        Object.keys(settings).some(key => !allowed.has(key))) {
      throw new HttpException("Permintaan pengelolaan katalog tidak valid. Sebutkan kategori, tindakan, dan field yang ingin diubah.", 422);
    }
    if (action !== "add" && ("provider" in settings || "provider_code" in settings)) {
      throw new HttpException("Identitas provider dan SKU tidak dapat diganti. Tambahkan varian baru untuk SKU lain.", 422);
    }
    this.permit(access, "products.read"); this.permit(access, "products.write"); this.category(access, category);

    if (action === "add") {
      const provider = typeof settings.provider === "string" ? settings.provider : "manual";
      const providerCode = settings.provider_code;
      const productName = settings.product, productSlug = settings.product_slug, name = settings.name, price = settings.price;
      if (typeof providerCode !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(providerCode) ||
          typeof productName !== "string" || !productName.trim() || productName.length > 100 ||
          typeof productSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug) ||
          typeof name !== "string" || !name.trim() || name.length > 200 || !Number.isSafeInteger(price) || Number(price) < 1 || Number(price) > 100000000) {
        throw new HttpException("Varian baru perlu provider/SKU, produk induk/slug, nama varian, dan harga jual yang valid.", 422);
      }
      this.product(access, productSlug);
      const duplicate = (await adminDb<ManagedProduct>("managed_products", `?category=eq.${category}&provider=eq.${encodeURIComponent(provider)}&provider_code=eq.${encodeURIComponent(providerCode)}&select=id,active,deleted_at&limit=1`))[0];
      if (duplicate) return { text: "Provider dan SKU itu sudah tercatat. Gunakan tindakan edit, show, atau restore pada SKU tersebut.", section: "catalog" };
      if (!/^[a-z0-9_-]+$/.test(provider)) throw new HttpException("Nama provider hanya boleh huruf kecil, angka, garis, atau underscore.", 422);
      const source = provider === "vipayment" ? (await this.catalogReader.list(category, true)).items.find(item => item.code === (typeof settings.supplier_code === "string" ? settings.supplier_code : providerCode)) : undefined;
      if (provider === "vipayment" && !source) throw new HttpException("SKU supplier tidak ditemukan. Cari SKU yang tersedia dari katalog provider.", 422);
      if (provider === "vipayment" && ["tasks", "apps"].includes(category)) throw new HttpException("VIPayment tidak digunakan untuk produk Joki Tugas atau Aplikasi Premium.", 422);
      const payload: ManagedProduct = {
        id: randomUUID(), provider, provider_code: providerCode, category: category as ManagedProduct["category"],
        product: productName.trim(), product_slug: productSlug, section: typeof settings.section === "string" ? settings.section.trim() : source?.section ?? null,
        name: name.trim(), price: Number(price), cost_price: settings.cost_price === undefined ? source?.providerCost ?? null : settings.cost_price as number | null,
        description: typeof settings.description === "string" ? settings.description.trim() : source?.description ?? "",
        active: settings.active === true, fulfillment_mode: provider === "vipayment" ? settings.fulfillment_mode === "manual" ? "manual" : "vipayment" : "manual",
        supplier_code: typeof settings.supplier_code === "string" ? settings.supplier_code : source?.code ?? providerCode,
        service_quantity: typeof settings.service_quantity === "number" ? settings.service_quantity : category === "social" && source ? Math.min(source.maximum ?? 1000, Math.max(source.minimum ?? 1, 1000)) : source?.serviceQuantity ?? 1,
      };
      if ((settings.active !== undefined && typeof settings.active !== "boolean") ||
          (settings.section !== undefined && settings.section !== null && (typeof settings.section !== "string" || settings.section.length > 100 || /[<>\u0000-\u001f]/.test(settings.section))) ||
          (settings.description !== undefined && (typeof settings.description !== "string" || settings.description.length > 2000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(settings.description))) ||
          (payload.cost_price !== null && (!Number.isSafeInteger(payload.cost_price) || Number(payload.cost_price) < 0 || Number(payload.cost_price) > 100000000)) ||
          !/^[A-Za-z0-9._-]{1,120}$/.test(String(payload.supplier_code)) ||
          !Number.isSafeInteger(payload.service_quantity) || Number(payload.service_quantity) < 1 || Number(payload.service_quantity) > 10000000 ||
          !["manual", "vipayment"].includes(String(payload.fulfillment_mode))) throw new HttpException("Field varian baru, modal, supplier, atau jumlah paket tidak valid.", 422);
      if (provider === "vipayment" && source) {
        if (source.requiresManualReview && payload.fulfillment_mode === "vipayment") throw new HttpException("SKU ini perlu pemrosesan manual oleh tim admin.", 422);
        if (category === "social" && (payload.service_quantity! < (source.minimum ?? 1) || payload.service_quantity! > (source.maximum ?? 10000000))) throw new HttpException("Jumlah layanan berada di luar rentang provider.", 422);
      }
      const productChanges = ["product", "product_slug", "section", "provider", "provider_code", "name", "price", "cost_price", "description", "fulfillment_mode", "supplier_code", "service_quantity", "active"]
        .map(key => ({ label: `${payload.provider_code} · ${key}`, before: "Belum ada", after: showCatalogValue(key, (payload as unknown as Record<string, unknown>)[key]) }));
      return this.createAssistantActionDraft(access, "product_save", { product: payload }, `Tambah varian ${payload.name}`,
        `${payload.product} / ${payload.product_slug} · ${payload.provider}:${payload.provider_code} · tab ${payload.section ?? "default"} · jual ${assistantRupiah.format(payload.price)} · modal ${payload.cost_price == null ? "belum diisi" : assistantRupiah.format(Number(payload.cost_price))} · ${payload.fulfillment_mode} · supplier ${payload.supplier_code} · jumlah ${payload.service_quantity} · ${payload.active ? "tampil" : "disembunyikan"}`, productChanges);
    }

    const query = typeof plan.query === "string" ? plan.query.trim() : "";
    const parent = typeof plan.product === "string" ? plan.product.trim().toLowerCase() : "";
    const batch = plan.batch === true || /\b(semua|seluruh|tiap|setiap|massal|batch|rentang|range|antara)\b|\b\d{1,6}\s*(?:-|–|sampai|hingga)\s*\d{1,6}\b/i.test(prompt);
    if (!query && !parent) throw new HttpException("Sebutkan SKU/nama varian atau produk induk untuk dicari.", 422);
    const data = await this.readProductManagement(access, category);
    let sourceItems: CatalogItem[] = [];
    try { sourceItems = (await this.catalogReader.list(category, true)).items; } catch { /* saved manual products can still be edited */ }
    const defaultPublished = (item: CatalogItem) => !item.requiresManualReview && (category === "game" ? featuredGameSlugs.includes(item.productSlug) : category !== "social");
    const saved = data.managed.filter(row => !row.deleted_at || ["show", "restore", "delete"].includes(action));
    const savedKeys = new Set(saved.map(row => `${row.provider}:${row.provider_code}`));
    const candidates: ManagedProduct[] = [
      ...saved,
      ...sourceItems.filter(item => !savedKeys.has(`vipayment:${item.code}`)).map(item => ({
        id: "", provider: "vipayment", provider_code: item.code, category: item.category, product: item.product,
        product_slug: item.productSlug, section: item.section ?? null, name: item.name, price: Number(item.price),
        cost_price: item.providerCost ?? null, description: item.description ?? "", active: defaultPublished(item),
        fulfillment_mode: item.requiresManualReview ? "manual" : "vipayment", supplier_code: item.code,
        service_quantity: item.category === "social" ? Math.min(item.maximum ?? 1000, Math.max(item.minimum ?? 1, 1000)) : item.serviceQuantity ?? 1,
      } as ManagedProduct)),
    ];
    const exact = candidates.filter(row => row.provider_code.toLowerCase() === query.toLowerCase());
    const range = prompt.match(/\b(\d{1,6})\s*(?:-|–|sampai|hingga)\s*(\d{1,6})\b/i);
    const min = plan.minAmount === undefined ? Number(range?.[1]) : Number(plan.minAmount);
    const max = plan.maxAmount === undefined ? Number(range?.[2]) : Number(plan.maxAmount);
    const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word && (!parent || !parent.split(/[^\p{L}\p{N}]+/u).includes(word)));
    const matches = (exact.length ? exact : candidates).filter(row => {
      if (parent && !`${row.product} ${row.product_slug}`.toLowerCase().includes(parent)) return false;
      const variant = `${row.name} ${row.provider_code}`.toLowerCase();
      const variantWords = variant.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (words.length && !words.every(word => /\d/.test(word) ? variantWords.includes(word) : variantWords.some(candidate => candidate.includes(word)))) return false;
      const quantities = (row.name.match(/\d+/g) ?? []).map(Number);
      if (Number.isFinite(min) && (!quantities.length || quantities.every(value => value < min))) return false;
      if (Number.isFinite(max) && (!quantities.length || quantities.every(value => value > max))) return false;
      if (["show", "restore"].includes(action) && row.active && !row.deleted_at) return false;
      if (action === "hide" && !row.active) return false;
      if (action === "delete" && row.deleted_at) return false;
      return true;
    });
    if (!matches.length) return { text: "Varian yang cocok tidak ditemukan dalam kategori atau cakupan akun ini.", section: "catalog" };
    if (action === "delete" && (batch || matches.length !== 1)) {
      return { text: "Penghapusan AI hanya menyiapkan satu SKU persis per draf. Sebutkan SKU yang tepat; gunakan hide untuk menonaktifkan banyak varian.", choices: matches.slice(0, 50).map(row => this.assistantCatalogChoice(row)), section: "catalog" };
    }
    if (matches.length > 50) return { text: `Ditemukan ${matches.length} varian. Draf pengelolaan dibatasi 50; persempit produk atau rentang.`, choices: matches.slice(0, 50).map(row => this.assistantCatalogChoice(row)), section: "catalog" };
    if (matches.length > 1 && !batch) return { text: `Ditemukan ${matches.length} varian. Sebutkan SKU tertentu atau minta tindakan untuk semua hasil ini secara eksplisit.`, choices: matches.slice(0, 50).map(row => this.assistantCatalogChoice(row)), section: "catalog" };
    if (action === "move") {
      if (typeof settings.product !== "string" || typeof settings.product_slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(settings.product_slug)) throw new HttpException("Untuk memindahkan varian, berikan nama dan slug produk induk tujuan.", 422);
      this.product(access, settings.product_slug);
      if (!candidates.some(row => !row.deleted_at && row.product_slug === settings.product_slug)) return { text: "Produk tujuan belum ada dalam katalog kategori ini. Buat produk/varian induk terlebih dahulu.", section: "catalog" };
    }
    const patch: Record<string, unknown> = action === "delete" ? {} : { ...settings };
    if (action === "hide") patch.active = false;
    if (["show", "restore"].includes(action)) patch.active = true;
    const products = matches.map(row => {
      const source = sourceItems.find(item => item.code === (row.supplier_code || row.provider_code));
      const presentationValues = Object.fromEntries(Object.entries(patch).filter(([key]) => ["name", "price", "description", "active"].includes(key)));
      const presentationPatch = Object.keys(presentationValues).length ? assistantPatch(presentationValues) : {};
      const base = !row.id && source ? this.assistantProviderPayload(row, presentationPatch, source) : { ...row };
      const product = { ...base, ...patch, id: row.id || randomUUID() } as ManagedProduct & { assistant_expected_version?: string };
      if (row.updated_at) product.assistant_expected_version = row.updated_at;
      if (typeof product.name !== "string" || !product.name.trim() || product.name.length > 200 || /[<>\u0000-\u001f]/.test(product.name) ||
          typeof product.description !== "string" || product.description.length > 2000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(product.description) ||
          typeof product.active !== "boolean" ||
          (product.section != null && (typeof product.section !== "string" || product.section.length > 100 || /[<>\u0000-\u001f]/.test(product.section))) ||
          !/^[A-Za-z0-9._-]{1,120}$/.test(String(product.supplier_code ?? product.provider_code))) throw new HttpException(`Field varian ${row.name} tidak valid.`, 422);
      if (product.provider === "vipayment" && product.active) {
        const supplier = sourceItems.find(item => item.code === (product.supplier_code || product.provider_code));
        if (!supplier) throw new HttpException(`SKU supplier untuk ${row.name} tidak tersedia.`, 422);
        if (supplier.requiresManualReview && product.fulfillment_mode !== "manual") throw new HttpException(`Varian ${row.name} wajib diproses manual oleh admin.`, 422);
        if (category === "social" && (product.service_quantity! < (supplier.minimum ?? 1) || product.service_quantity! > (supplier.maximum ?? 10000000))) throw new HttpException(`Jumlah layanan ${row.name} di luar rentang supplier.`, 422);
      }
      return product;
    });
    if (action === "delete") {
      const row = matches[0]!;
      return this.createAssistantActionDraft(access, "product_remove", { product: products[0], expectedVersion: row.updated_at ?? null }, `Hapus ${row.name} dari katalog`, `${row.product} · ${row.provider_code} · akan disembunyikan dari katalog dan checkout baru`, [
        { label: `${row.provider_code} · Visibilitas`, before: row.active ? "Tampil" : "Disembunyikan", after: "Dihapus dari katalog" },
      ]);
    }
    for (const row of products) {
      if (typeof row.product_slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.product_slug) ||
          typeof row.product !== "string" || !row.product.trim() || row.product.length > 100 ||
          (row.section != null && (typeof row.section !== "string" || row.section.length > 100)) ||
          (row.cost_price != null && (!Number.isSafeInteger(row.cost_price) || Number(row.cost_price) < 0 || Number(row.cost_price) > 100000000)) ||
          (row.active != null && typeof row.active !== "boolean") ||
          (row.service_quantity != null && (!Number.isSafeInteger(row.service_quantity) || Number(row.service_quantity) < 1 || Number(row.service_quantity) > 10000000)) ||
          (row.fulfillment_mode != null && !["manual", "vipayment"].includes(row.fulfillment_mode))) throw new HttpException("Field pemetaan, modal, atau jumlah layanan tidak valid.", 422);
      this.product(access, row.product_slug);
    }
    const fieldLabels: Record<string, string> = { product: "Produk induk", product_slug: "Slug", section: "Tab", name: "Nama", price: "Harga jual", cost_price: "Modal", description: "Deskripsi", active: "Tampil", fulfillment_mode: "Pemrosesan", supplier_code: "SKU supplier", service_quantity: "Jumlah paket" };
    const showValue = (key: string, value: unknown) => key === "price" || key === "cost_price"
      ? value == null ? "belum diisi" : assistantRupiah.format(Number(value))
      : key === "active" ? value ? "aktif" : "disembunyikan"
      : value == null || value === "" ? "kosong" : String(value);
    const actionChanges = products.flatMap((next, index) => {
      const before = matches[index]!;
      const fields = ["product", "product_slug", "section", "name", "price", "cost_price", "description", "active", "fulfillment_mode", "supplier_code", "service_quantity"];
      return fields.filter(key => (before as unknown as Record<string, unknown>)[key] !== (next as unknown as Record<string, unknown>)[key])
        .map(key => ({ label: `${next.provider_code} · ${fieldLabels[key] ?? key}`, before: showValue(key, (before as unknown as Record<string, unknown>)[key]), after: showValue(key, (next as unknown as Record<string, unknown>)[key]) }));
    });
    if (!actionChanges.length) return { text: "Varian yang dipilih sudah memiliki semua nilai yang diminta.", section: "catalog" };
    const reviewSummary = `${products.length} varian · perubahan sebelum/sesudah tercantum di bawah.`;
    if (products.length === 1) return this.createAssistantActionDraft(access, "product_save", { product: products[0] }, `${action === "move" ? "Pindahkan" : "Perbarui"} ${products[0]!.name}`, reviewSummary, actionChanges);
    return this.createAssistantActionDraft(access, "product_batch", { items: products, fullConfig: true }, `${action === "move" ? "Pindahkan" : "Perbarui"} ${products.length} varian`, reviewSummary, actionChanges);
  }

  private async assistantProductRulesDraft(access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep): Promise<AssistantOutput> {
    const category = plan.category, query = typeof plan.query === "string" ? plan.query.trim() : "";
    if (category !== "tasks" && category !== "apps") throw new HttpException("Aturan produk hanya tersedia untuk kategori tasks atau apps.", 422);
    if (!query) throw new HttpException("Sebutkan SKU atau nama varian tersimpan yang tepat.", 422);
    this.permit(access, "products.read"); this.permit(access, "products.write"); this.category(access, category);
    const data = await this.readProductManagement(access, category);
    const matches = data.managed.filter(row => !row.deleted_at && row.provider === "manual" &&
      (row.provider_code.toLowerCase() === query.toLowerCase() || row.name.trim().toLowerCase() === query.toLowerCase()));
    if (matches.length !== 1) return { text: matches.length ? "Nama varian cocok dengan beberapa item. Gunakan SKU persis." : "Varian manual tersimpan tidak ditemukan.",
      choices: matches.slice(0, 20).map(row => this.assistantCatalogChoice(row)), section: category };
    const product = matches[0]!;
    this.product(access, product.product_slug);
    const settings = plan.settings === undefined ? {} : assistantObject(plan.settings);
    if (category === "tasks") {
      const fields = new Set(["pricing_unit", "base_fee", "price_per_page", "price_per_revision", "rush_fee_per_day", "standard_days", "max_pages", "max_revisions"]);
      if (Object.keys(settings).some(key => !fields.has(key))) throw new HttpException("Draf tarif memuat field yang tidak didukung.", 422);
      const current = (await adminDb<Record<string, unknown>>("task_price_rules", `?product_id=eq.${product.id}&select=pricing_unit,base_fee,price_per_page,price_per_revision,rush_fee_per_day,standard_days,max_pages,max_revisions,updated_at&limit=1`))[0];
      const { updated_at: currentVersion, ...currentRule } = current ?? {};
      const rule = { pricing_unit: "page", base_fee: null, price_per_page: 0, price_per_revision: 0, rush_fee_per_day: 0, standard_days: 7, max_pages: 100, max_revisions: 0, ...currentRule, ...settings };
      if (!Object.keys(settings).length || !["page", "slide", "minute", "item", "custom"].includes(String(rule.pricing_unit)) ||
          (rule.base_fee !== null && (!Number.isSafeInteger(rule.base_fee) || Number(rule.base_fee) < 0 || Number(rule.base_fee) > 100000000)) ||
          !Number.isSafeInteger(rule.price_per_page) || Number(rule.price_per_page) < 0 || Number(rule.price_per_page) > 1000000 ||
          !Number.isSafeInteger(rule.price_per_revision) || Number(rule.price_per_revision) < 0 || Number(rule.price_per_revision) > 1000000 ||
          !Number.isSafeInteger(rule.rush_fee_per_day) || Number(rule.rush_fee_per_day) < 0 || Number(rule.rush_fee_per_day) > 1000000 ||
          !Number.isSafeInteger(rule.standard_days) || Number(rule.standard_days) < 1 || Number(rule.standard_days) > 90 ||
          !Number.isSafeInteger(rule.max_pages) || Number(rule.max_pages) < 1 || Number(rule.max_pages) > 500 ||
          !Number.isSafeInteger(rule.max_revisions) || Number(rule.max_revisions) < 0 || Number(rule.max_revisions) > 20) throw new HttpException("Field aturan tarif joki tidak valid atau belum lengkap.", 422);
      const taskLabels: Record<string, string> = { pricing_unit: "Unit tarif", base_fee: "Biaya dasar", price_per_page: "Tarif per unit", price_per_revision: "Tarif revisi", rush_fee_per_day: "Biaya percepatan per hari", standard_days: "Tenggat standar", max_pages: "Batas unit", max_revisions: "Batas revisi" };
      const taskSummary = Object.keys(settings).map(key => `${taskLabels[key] ?? key}: ${currentRule[key] ?? "belum diatur"} → ${rule[key as keyof typeof rule]}`).join(" · ");
      const taskChanges = Object.keys(settings).map(key => ({ label: taskLabels[key] ?? key, before: String(currentRule[key] ?? "Belum diatur"), after: String(rule[key as keyof typeof rule]) }));
      const action = await this.createAssistantActionDraft(access, "task_rule_save", { product_id: product.id, product_expected_version: product.updated_at, rule, rule_expected_version: currentVersion ?? null },
        `Atur tarif joki ${product.name}`, taskSummary, taskChanges);
      return { ...action, section: "tasks" };
    }
    const fields = new Set(["access_type", "duration_days", "guarantee_days", "guarantee_terms"]);
    if (Object.keys(settings).some(key => !fields.has(key))) throw new HttpException("Draf ketentuan premium memuat field yang tidak didukung.", 422);
    const current = (await adminDb<Record<string, unknown>>("premium_product_rules", `?product_id=eq.${product.id}&select=access_type,duration_days,guarantee_days,guarantee_terms,updated_at&limit=1`))[0];
    const { updated_at: currentVersion, ...currentRule } = current ?? {};
    const rule = { access_type: "private", duration_days: 30, guarantee_days: 7,
      guarantee_terms: "Garansi berlaku untuk gangguan akses yang bukan akibat perubahan data akun oleh pelanggan.", ...currentRule, ...settings };
    if (!Object.keys(settings).length || !["private", "sharing", "other"].includes(String(rule.access_type)) ||
        !Number.isSafeInteger(rule.duration_days) || Number(rule.duration_days) < 1 || Number(rule.duration_days) > 730 ||
        !Number.isSafeInteger(rule.guarantee_days) || Number(rule.guarantee_days) < 0 || Number(rule.guarantee_days) > 365 ||
        typeof rule.guarantee_terms !== "string" || rule.guarantee_terms.trim().length < 10 || rule.guarantee_terms.length > 2000) throw new HttpException("Field aturan Aplikasi Premium tidak valid atau belum lengkap.", 422);
    const premiumLabels: Record<string, string> = { access_type: "Jenis akses", duration_days: "Durasi akses", guarantee_days: "Durasi garansi", guarantee_terms: "Ketentuan klaim" };
    const premiumSummary = Object.keys(settings).map(key => `${premiumLabels[key] ?? key}: ${currentRule[key] ?? "belum diatur"} → ${rule[key as keyof typeof rule]}`).join(" · ");
    const premiumChanges = Object.keys(settings).map(key => ({ label: premiumLabels[key] ?? key, before: String(currentRule[key] ?? "Belum diatur"), after: String(rule[key as keyof typeof rule]) }));
    const action = await this.createAssistantActionDraft(access, "premium_rule_save", { product_id: product.id, product_expected_version: product.updated_at, rule, rule_expected_version: currentVersion ?? null },
      `Atur ketentuan ${product.name}`, premiumSummary, premiumChanges);
    return { ...action, section: "apps" };
  }

  private async assistantPromotionDraft(access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep): Promise<AssistantOutput> {
    const category = plan.category, query = plan.query, action = plan.action ?? "set";
    if (typeof category !== "string" || !assistantCategories.includes(category as typeof assistantCategories[number]) || category === "tasks" ||
        typeof query !== "string" || !query.trim() || query.length > 150 || !["set", "disable"].includes(String(action))) {
      throw new HttpException("Sebutkan kategori, satu SKU/nama varian, dan jadwal promo atau permintaan untuk menonaktifkannya.", 422);
    }
    this.permit(access, "products.read"); this.permit(access, "products.write"); this.category(access, category);
    const normalized = query.trim().toLowerCase();
    let source: CatalogItem[] = [];
    try { source = (await this.catalogReader.list(category)).items; } catch { /* manual managed variants remain manageable */ }
    const managed = (await this.readProductManagement(access, category)).managed.filter(row => row.active && !row.deleted_at);
    const candidates = managed.map(row => ({
      code: row.provider === "vipayment" && category !== "social" ? row.provider_code : `managed.${row.id}`,
      providerCode: row.provider_code, name: row.name, product: row.product, productSlug: row.product_slug,
      price: Number(row.price), row,
    }));
    for (const item of source) if (!managed.some(row => row.provider === "vipayment" && row.provider_code === item.code)) {
      candidates.push({ code: item.code, providerCode: item.code, name: item.name, product: item.product, productSlug: item.productSlug, price: Number(item.price), row: null as unknown as ManagedProduct });
    }
    const exact = candidates.filter(row => row.code.toLowerCase() === normalized || row.providerCode.toLowerCase() === normalized);
    const matches = exact.length ? exact : candidates.filter(row => `${row.name} ${row.product}`.toLowerCase() === normalized);
    if (matches.length !== 1) return { text: matches.length ? "Nama itu cocok dengan beberapa varian. Kirim SKU provider yang tepat." : "Varian promo tidak ditemukan di katalog provider.",
      choices: matches.slice(0, 20).map(item => ({ name: item.name, product: item.product, sku: item.code, category, price: item.price, active: true })), section: "catalog" };
    const item = matches[0]!;
    this.product(access, item.productSlug);
    const existing = (await adminDb<Record<string, unknown>>("catalog_promotions",
      `?category=eq.${category}&item_code=eq.${encodeURIComponent(item.code)}&select=*&limit=1`))[0];
    let salePrice: number, startsAt: string, endsAt: string, active: boolean;
    if (action === "disable" || plan.active === false) {
      if (!existing) return { text: `Tidak ada jadwal promo tersimpan untuk ${item.name}.`, section: "catalog" };
      salePrice = Number(existing.sale_price); startsAt = String(existing.starts_at); endsAt = String(existing.ends_at); active = false;
      if (!Number.isSafeInteger(salePrice) || salePrice < 1 || salePrice >= item.price) salePrice = Math.max(1, item.price - 1);
      if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) {
        startsAt = new Date().toISOString(); endsAt = new Date(Date.now() + 60_000).toISOString();
      }
    } else {
      const discount = plan.discount;
      if (plan.salePrice !== undefined) salePrice = Number(plan.salePrice);
      else if (Number.isFinite(Number(discount)) && Number(discount) > 0 && Number(discount) < 100) {
        salePrice = Math.max(1, Math.ceil(item.price * (10000 - Math.round(Number(discount) * 100)) / 10000));
      } else throw new HttpException("Tentukan harga promo atau persen diskon di bawah 100%.", 422);
      startsAt = String(plan.startsAt ?? ""); endsAt = String(plan.endsAt ?? ""); active = true;
      const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
      if (!zoned.test(startsAt) || !zoned.test(endsAt) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw new HttpException("Jadwal promo perlu waktu mulai dan akhir yang valid, lengkap dengan zona waktu.", 422);
      }
      if (Date.parse(endsAt) - Date.parse(startsAt) > 90 * 86400000) throw new HttpException("Jadwal promo maksimal 90 hari.", 422);
    }
    if (!Number.isSafeInteger(salePrice) || salePrice < 1 || salePrice >= item.price) throw new HttpException("Harga promo harus rupiah bulat di bawah harga dasar.", 422);
    const payload = { category, item_code: item.code, sale_price: salePrice, starts_at: startsAt, ends_at: endsAt, active };
    return this.createAssistantActionDraft(access, "promotion_save", payload, `${active ? "Atur" : "Nonaktifkan"} promo ${item.name}`,
      `${item.product} · ${item.code} · perubahan promo ditinjau di bawah`, [
        { label: "Harga promo", before: existing ? assistantRupiah.format(Number(existing.sale_price)) : "Belum ada", after: assistantRupiah.format(salePrice) },
        { label: "Mulai", before: existing ? String(existing.starts_at) : "Belum ada", after: startsAt },
        { label: "Selesai", before: existing ? String(existing.ends_at) : "Belum ada", after: endsAt },
        { label: "Status", before: existing?.active ? "Aktif" : "Nonaktif / belum ada", after: active ? "Aktif" : "Nonaktif" },
      ]);
  }

  private async assistantVoucherDraft(access: Awaited<ReturnType<AdminController["authorize"]>>, plan: AssistantStep, prompt: string): Promise<AssistantOutput> {
    if (!access.superAdmin) throw new HttpException("Pengelolaan voucher hanya untuk super admin.", 403);
    const action = plan.action;
    if (!["create", "update", "disable"].includes(String(action))) throw new HttpException("Tentukan apakah akan membuat, mengubah, atau menonaktifkan voucher.", 422);
    const supplied = plan.settings === undefined ? {} : assistantObject(plan.settings);
    const safeFields = new Set(["name", "code", "kind", "value", "discount_cap", "minimum_amount", "category", "product_slug", "variant_code", "starts_at", "ends_at", "total_limit", "account_limit", "allow_promotion", "active"]);
    if (Object.keys(supplied).some(key => !safeFields.has(key))) throw new HttpException("Draf voucher berisi kolom yang tidak didukung.", 422);
    let id: string = randomUUID(), version = 1;
    let settings: ReturnType<typeof parseVoucherSettings>;
    if (action === "create") {
      const draft = { ...supplied, active: supplied.active === true && /\baktifkan|langsung aktif\b/i.test(prompt), allow_promotion: supplied.allow_promotion ?? false };
      settings = parseVoucherSettings(draft);
    } else {
      const query = plan.query;
      if (typeof query !== "string" || !query.trim() || query.length > 100) throw new HttpException("Untuk mengubah voucher, sebutkan kode atau nama voucher secara tepat.", 422);
      const rows = await this.voucherStore.request<Record<string, unknown>[]>("vouchers?select=*&order=created_at.desc&limit=500");
      const term = query.trim().toLowerCase();
      const matches = rows.filter(row => typeof row.code === "string" && row.code.toLowerCase() === term || typeof row.name === "string" && row.name.trim().toLowerCase() === term);
      if (matches.length !== 1) return { text: matches.length ? "Nama voucher tidak unik. Gunakan kode voucher yang tepat." : "Voucher tidak ditemukan.", section: "vouchers" };
      const current = matches[0]!;
      if (typeof current.id !== "string" || !voucherUuid.test(current.id) || !Number.isSafeInteger(current.version)) throw new HttpException("Versi voucher belum tersedia untuk perubahan aman.", 503);
      id = current.id; version = Number(current.version);
      settings = parseVoucherSettings({ ...current, ...supplied, active: action === "disable" ? false : supplied.active ?? current.active,
        allow_promotion: supplied.allow_promotion ?? current.allow_promotion });
    }
    if (settings.active && settings.product_slug && settings.category) {
      const source = await this.catalogReader.list(settings.category, true);
      if (!source.items.some(item => item.productSlug === settings.product_slug && (!settings.variant_code || item.code === settings.variant_code)))
        throw new HttpException("Produk atau varian target voucher tidak tersedia.", 409);
    }
    const payload = { operation: action === "create" ? "create" : "update", id, version, settings };
    return this.createAssistantActionDraft(access, "voucher_save", payload,
      `${action === "create" ? "Buat" : action === "disable" ? "Nonaktifkan" : "Ubah"} voucher ${settings.name}`,
      `${settings.code || "Kode dibuat otomatis"} · ${settings.kind} · ${settings.active ? "aktif" : "nonaktif"} · hingga ${settings.ends_at}`);
  }

  private async assistantCatalog(
    access: Awaited<ReturnType<AdminController["authorize"]>>,
    query: unknown, category: unknown, patch: ReturnType<typeof assistantPatch> | null,
    selector: { product?: unknown; minAmount?: unknown; maxAmount?: unknown; batch?: boolean } = {}, prompt = "",
  ) {
    const productFilter = selector.product;
    const term = typeof query === "string" ? query.trim().toLowerCase() : "";
    const parent = typeof productFilter === "string" ? productFilter.trim().toLowerCase() : "";
    const parseAmount = (value: unknown) => value === undefined || value === null || value === "" ? undefined
      : typeof value === "number" || typeof value === "string" && /^\d{1,7}$/.test(value) ? Number(value) : NaN;
    const minAmount = parseAmount(selector.minAmount), maxAmount = parseAmount(selector.maxAmount);
    if (typeof query !== "string" || query.length > 150 || (!term && !parent) ||
        (typeof productFilter !== "undefined" && (typeof productFilter !== "string" || productFilter.length > 120)) ||
        (minAmount !== undefined && (!Number.isSafeInteger(minAmount) || minAmount < 0)) ||
        (maxAmount !== undefined && (!Number.isSafeInteger(maxAmount) || maxAmount < 1)) ||
        (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) ||
        (category !== undefined && category !== null && !assistantCategories.some(value => value === category))) {
      throw new HttpException("Sebutkan produk induk atau varian, kategori, dan rentang nominal yang valid.", 422);
    }
    if (typeof category === "string") this.category(access, category);
    const categories = access.categories.filter(value => !category || category === value);
    const data = await Promise.all(categories.map(value => this.readProductManagement(access, value)));
    const candidates = data.flatMap(result => {
      const managed = new Map(result.managed.map(row => [`${row.provider}:${row.provider_code}`, row]));
      return [
        ...result.managed.filter(row => !row.deleted_at),
        ...result.items.filter(item => !managed.has(`vipayment:${item.code}`)).map(item => ({
          id: "", name: item.name, product: item.product, product_slug: item.productSlug, provider: "vipayment",
          provider_code: item.code, category: item.category, price: item.price, description: item.description, active: !!item.defaultPublished,
        } as ManagedProduct)),
      ];
    });
    const exactSku = term ? candidates.filter(row => row.provider_code.toLowerCase() === term) : [];
    const productTerms = parent.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const parentSet = new Set(productTerms);
    const queryTerms = term.split(/[^\p{L}\p{N}]+/u).filter(word => word && (!parent || !parentSet.has(word)));
    const matches = (exactSku.length ? exactSku : candidates).filter(row => {
      const productWords = `${row.product} ${row.product_slug}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const variantWords = `${row.name} ${row.provider_code}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (productTerms.length && !productTerms.every(word => productWords.some(candidate => candidate.includes(word) || word.includes(candidate)))) return false;
      if (queryTerms.length && !queryTerms.every(word => (parent ? variantWords : [...variantWords, ...productWords]).some(candidate =>
        /\d/.test(word) ? candidate === word : candidate.includes(word)))) return false;
      const quantities = (row.name.match(/\d+/g) ?? []).map(Number);
      if (minAmount !== undefined || maxAmount !== undefined) {
        if (!quantities.length || quantities.every(value => value < (minAmount ?? 0) || value > (maxAmount ?? Number.MAX_SAFE_INTEGER))) return false;
      }
      return true;
    });
    const choices = matches.slice(0, 50).map(row => this.assistantCatalogChoice(row));
    const sourceIncomplete = data.some(result => !result.providerAvailable);
    if (!patch || matches.length !== 1) {
      const message = matches.length === 0 ? "Varian tidak ditemukan. Coba nama, SKU, produk induk, atau rentang nominal yang lebih spesifik."
        : matches.length > 50 ? `Ditemukan ${matches.length} varian. Draf AI dibatasi 50 item; persempit produk atau rentang sebelum mengubah apa pun.`
        : patch && matches.length > 1 && !selector.batch ? `Ditemukan ${matches.length} varian. Tinjau hasil di bawah, lalu minta perubahan untuk semua varian yang cocok atau sebutkan SKU tertentu.`
        : `Ditemukan ${matches.length} varian dalam cakupan akses kamu.`;
      if (patch && selector.batch && matches.length > 1 && matches.length <= 50) {
        this.permit(access, "products.write");
        const targets = matches.filter(row => Object.keys(patch).some(key => {
          const old = ({ name: row.name, price: Number(row.price), description: row.description, active: row.active } as Record<string, unknown>)[key];
          return old !== (patch as Record<string, unknown>)[key];
        }));
        if (!targets.length) return { text: "Semua varian yang dipilih sudah memiliki nilai tersebut.", choices, section: "catalog" };
        if (targets.every(row => row.id && row.updated_at)) {
          const id = randomUUID();
          const items = targets.map(row => {
            const before = { name: row.name, price: Number(row.price), description: row.description, active: row.active };
            const beforeValues = Object.fromEntries(Object.keys(patch).map(key => [key, before[key as keyof typeof before]]));
            return { id: randomUUID(), product_id: row.id, category: row.category, product_slug: row.product_slug,
              product_version: row.updated_at, before_values: beforeValues, patch };
          });
          const [entry] = await adminDb<{ expires_at: string }>("rpc/stage_admin_assistant_batch", "", "POST", { p_id: id, p_actor: access.id, p_items: items });
          if (!entry?.expires_at) throw new HttpException("Draf perubahan varian belum dapat disimpan.", 503);
          return { text: `Draf berisi ${targets.length} varian ${parent || term}. Periksa setiap SKU dan perubahan sebelum menerapkan.`, section: "catalog",
            batch: { id, expiresAt: entry.expires_at, rows: targets.map(row => ({ ...this.assistantCatalogChoice(row),
              changes: Object.keys(patch).map(key => ({ key, before: ({ name: row.name, price: Number(row.price), description: row.description, active: row.active } as Record<string, unknown>)[key], after: (patch as Record<string, unknown>)[key] })) })) } };
        }
        if (targets.some(row => row.provider !== "vipayment")) {
          return { text: "Sebagian varian khusus belum mendukung draf massal. Persempit pilihan atau edit SKU satu per satu.", choices, section: "catalog" };
        }
        const sourceByCategory = new Map<string, CatalogItem[]>();
        for (const itemCategory of [...new Set(targets.map(row => row.category))]) {
          sourceByCategory.set(itemCategory, (await this.catalogReader.list(itemCategory, true)).items);
        }
        const payloads = targets.map(row => {
          const source = sourceByCategory.get(row.category)?.find(item => item.code === (row.supplier_code || row.provider_code));
          return source ? this.assistantProviderPayload(row, patch, source) : null;
        });
        if (payloads.some(payload => !payload)) return { text: "Satu atau lebih SKU sudah tidak tersedia pada provider. Segarkan katalog sebelum membuat draf.", choices, section: "catalog" };
        const validPayloads = payloads.filter((payload): payload is ManagedProduct => !!payload);
        return this.createAssistantActionDraft(access, "product_batch", { items: validPayloads }, `Ubah ${targets.length} varian`,
          `${parent || term} · ${targets.map(row => `${row.name} (${row.provider_code})`).join(", ")}`);
      }
      return { text: message + (sourceIncomplete ? " Sebagian katalog provider mungkin tidak tersedia." : ""), choices, section: "catalog" };
    }
    return this.draftAssistantProduct(access, matches[0]!, patch);
  }

  private async draftAssistantProduct(access: Awaited<ReturnType<AdminController["authorize"]>>, row: ManagedProduct, patch: ReturnType<typeof assistantPatch>) {
    const choice = this.assistantCatalogChoice(row);
    if (!row.id || !row.updated_at) {
      if (row.provider !== "vipayment") return { text: "Varian khusus ini perlu disimpan melalui editor katalog sebelum dapat diubah AI.", choices: [choice], section: "catalog" };
      const source = (await this.catalogReader.list(row.category, true)).items.find(item => item.code === row.provider_code);
      if (!source) return { text: "Varian tidak tersedia pada katalog provider. Segarkan katalog sebelum mengubahnya.", choices: [choice], section: "catalog" };
      this.permit(access, "products.write"); this.category(access, row.category); this.product(access, row.product_slug);
      const payload = this.assistantProviderPayload(row, patch, source);
      const fields = Object.keys(patch).map(key => `${key}: ${(patch as Record<string, unknown>)[key]}`).join(" · ");
      const action = await this.createAssistantActionDraft(access, "product_create", payload,
        `${patch.active === false ? "Sembunyikan" : "Atur"} ${row.name}`, `${row.product} · ${row.provider_code} · ${fields}`);
      return { ...action, text: "Varian default provider akan disimpan sebagai pengaturan admin setelah kamu menyetujui draf." };
    }
    if (patch.active === true && !row.active && row.provider === "vipayment") {
      return { text: "Untuk menampilkan kembali varian provider yang disembunyikan, tinjau pemetaan supplier di editor katalog terlebih dahulu.", choices: [choice], section: "catalog" };
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
    if (assistantRegistryEnabled() && !(await this.assistantCapabilities(access)).tools.includes("catalog_edit")) {
      throw new HttpException("Skill Edit produk tidak tersedia untuk sesi ini.", 403);
    }
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

  private workNotificationSections(access: Awaited<ReturnType<AdminController["authorize"]>>) {
    const sections: string[] = [];
    if (access.permissions.includes("*") || access.permissions.includes("orders.read")) {
      if (access.categories.length === 5 && !access.productSlugs.length) sections.push("orders");
      if (access.categories.includes("tasks")) sections.push("tasks");
      if (access.categories.includes("apps")) sections.push("apps");
    }
    if (access.superAdmin) sections.push("reviews");
    return sections;
  }

  @Get("work-notifications")
  async workNotifications(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res);
    const sections = this.workNotificationSections(access);
    const summary = sections.length ? await adminDb("rpc/admin_work_notifications", "", "POST", {
      p_admin: access.id, p_sections: sections, p_product_slugs: access.productSlugs,
    }) : [];
    return { sections: summary };
  }

  @Post("work-notifications/:section/read")
  async readWorkNotifications(@Param("section") section: string, @Body() body: { through?: unknown },
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    if (!this.workNotificationSections(access).includes(section)) throw new HttpException("Izin admin tidak mencukupi.", 403);
    const through = body?.through;
    if (typeof through !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(through) || !Number.isFinite(Date.parse(through))) {
      throw new HttpException("Waktu notifikasi tidak valid.", 400);
    }
    await adminDb("rpc/mark_admin_work_notifications_read", "", "POST", {
      p_admin: access.id, p_section: section, p_through: through,
    });
    return { ok: true };
  }

  @Post("work-notifications/:section/read-item")
  async readWorkNotificationItem(@Param("section") section: string, @Body() body: { id?: unknown },
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res, true);
    if (!this.workNotificationSections(access).includes(section)) throw new HttpException("Izin admin tidak mencukupi.", 403);
    if (!uuid(body?.id)) throw new HttpException("Pesanan tidak valid.", 400);
    await adminDb("rpc/mark_admin_work_notification_item_read", "", "POST", {
      p_admin: access.id, p_section: section, p_item: body.id,
    });
    return { ok: true };
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

  @Get("campaign")
  async getCampaign(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access=await this.authorize(req,res);
    if(!access.superAdmin)throw new HttpException("Campaign memerlukan akses super admin.",403);
    const [settings]=await adminDb<{revision:number;enabled:boolean;config:Record<string,unknown>}>("campaign_settings","?id=eq.1&select=revision,enabled,config&limit=1");
    const templates=await adminDb<{id:string;name:string;ends_at:string;kind:string;value:number}>("vouchers","?select=id,name,ends_at,kind,value&code=is.null&active=eq.true&account_limit=not.is.null&ends_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=name&limit=200");
    const referrals=await adminDb<{id:string;referrer_user_id:string;referred_user_id:string;status:string;created_at:string;qualified_at:string|null;qualifying_invoice_id:string|null}>("referral_attributions","?select=id,referrer_user_id,referred_user_id,status,created_at,qualified_at,qualifying_invoice_id&order=created_at.desc&limit=100");
    const invoiceIds=referrals.flatMap(row=>row.qualifying_invoice_id??[]);
    const invoices=invoiceIds.length?await adminDb<{id:string;invoice_number:string;product_name:string;amount:number;created_at:string}>("invoices","?id=in.("+invoiceIds.join(",")+")&select=id,invoice_number,product_name,amount,created_at&payment_mode=eq.live"):[];
    return {settings:settings??null,templates,referrals:referrals.map(row=>({...row,qualifyingInvoice:invoices.find(invoice=>invoice.id===row.qualifying_invoice_id)??null}))};
  }

  @Post("campaign")
  async saveCampaign(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    if(!access.superAdmin)throw new HttpException("Campaign memerlukan akses super admin.",403);
    const input=body&&typeof body==="object"?body as Record<string,unknown>:{};
    if(Object.keys(input).some(key=>!['revision','enabled','config'].includes(key))||!Number.isSafeInteger(input.revision)||typeof input.enabled!=="boolean"||!input.config||typeof input.config!=="object"||Array.isArray(input.config))throw new HttpException("Pengaturan campaign tidak valid.",400);
    const config=input.config as Record<string,unknown>;
    const allowed=['title','description','startsAt','endsAt','minReferralAmount','referrerVoucherTemplate','friendVoucherTemplate','missions'];
    if(Object.keys(config).some(key=>!allowed.includes(key))||typeof config.title!=="string"||config.title.trim().length<3||config.title.length>90||typeof config.description!=="string"||config.description.length>400||!Number.isSafeInteger(config.minReferralAmount)||Number(config.minReferralAmount)<0||Number(config.minReferralAmount)>100000000)throw new HttpException("Judul, deskripsi, dan nominal minimum referral tidak valid.",400);
    const dateOk=(value:unknown)=>value===null||typeof value==="string"&&Number.isFinite(Date.parse(value));
    if(!dateOk(config.startsAt)||!dateOk(config.endsAt)||config.startsAt&&config.endsAt&&Date.parse(String(config.endsAt))<=Date.parse(String(config.startsAt)))throw new HttpException("Jadwal campaign tidak valid.",400);
    const missionIds=['verified_email','first_completed_order','referral_rewarded'];
    if(!Array.isArray(config.missions)||config.missions.length!==3||config.missions.some((mission,index)=>!mission||typeof mission!=="object"||(mission as any).id!==missionIds[index]||typeof (mission as any).title!=="string"||!(mission as any).title.trim()||(mission as any).title.length>80||typeof (mission as any).description!=="string"||(mission as any).description.length>180))throw new HttpException("Susunan misi tidak valid.",400);
    for(const key of ['referrerVoucherTemplate','friendVoucherTemplate']) {
      const id=config[key];
      if(typeof id!=="string"||!uuid(id))throw new HttpException("Pilih voucher akun yang masih aktif untuk kedua reward referral.",400);
      const [template]=await adminDb<{id:string}>("vouchers",`?id=eq.${encodeURIComponent(id)}&code=is.null&active=eq.true&account_limit=not.is.null&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`);
      if(!template)throw new HttpException("Template reward harus berupa voucher akun aktif dan belum kedaluwarsa.",400);
    }
    const [saved]=await adminDb<{revision:number}>("campaign_settings",`?id=eq.1&revision=eq.${Number(input.revision)}&select=revision`,"PATCH",{enabled:input.enabled,config,revision:Number(input.revision)+1,updated_at:new Date().toISOString()});
    if(!saved)throw new HttpException("Pengaturan campaign berubah di sesi lain. Muat ulang sebelum menyimpan.",409);
    await this.audit(access.id,"campaign.settings.update","grand-opening");
    return {revision:saved.revision};
  }

  @Patch("referrals/:id")
  async reviewReferral(@Param("id") id:string,@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true);
    if(!access.superAdmin)throw new HttpException("Pemeriksaan referral memerlukan akses super admin.",403);
    if(!uuid(id))throw new HttpException("Referral tidak ditemukan.",404);
    const input=body&&typeof body==="object"?body as Record<string,unknown>:{};
    if(typeof input.approve!=="boolean"||input.note!==undefined&&(typeof input.note!=="string"||input.note.length>500))throw new HttpException("Keputusan referral tidak valid.",400);
    await this.audit(access.id,"campaign.referral.review",id);
    const result=await this.voucherStore.rpc<unknown>("review_referral",{p_referral:id,p_approve:input.approve,p_actor:access.id,p_note:input.note??null});
    return {result};
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
      `?select=id,category,product_slug,invoice_id,purchase_verified,rating,comment,reviewer_email,reviewer_user_id,status,created_at,updated_at&order=created_at.desc,id&limit=51&offset=${index * 50}${filter}`);
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
      if (input.status === "published") {
        const [proof] = await adminDb<{ purchase_verified: boolean; invoice_id: string | null }>("product_reviews",
          `?id=eq.${encodeURIComponent(id)}&select=purchase_verified,invoice_id&limit=1`);
        if (!proof?.purchase_verified || !proof.invoice_id)
          throw new HttpException("Ulasan tanpa bukti invoice transaksi selesai tidak dapat dipublikasikan.", 409);
      }
      patch.status = input.status;
    }
    if (input.rating !== undefined) {
      if (!isReviewRating(input.rating))
        throw new HttpException("Rating harus 0,5 sampai 5 bintang dengan kelipatan 0,5.", 400);
      patch.rating = input.rating;
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
    if (body.category === "tasks") throw new HttpException("Kategori joki tugas menggunakan aturan tarif, bukan promo katalog.", 400);
    let source: Awaited<ReturnType<CatalogController["list"]>>["items"][number] | undefined;
    try { source = (await this.catalogReader.list(body.category)).items.find(row => row.code === body.item_code); } catch { /* manual managed variants do not require a live provider list */ }
    let managed: ManagedProduct | undefined;
    if (body.item_code.startsWith("managed.")) {
      const id = body.item_code.slice("managed.".length);
      if (uuid(id)) managed = (await adminDb<ManagedProduct>("managed_products", `?id=eq.${id}&category=eq.${body.category}&select=*&limit=1`))[0];
    } else {
      managed = (await adminDb<ManagedProduct>("managed_products", `?category=eq.${body.category}&provider_code=eq.${encodeURIComponent(body.item_code)}&select=*&limit=1`))[0];
    }
    if (managed && (!managed.active || managed.deleted_at)) throw new HttpException("Promo tidak dapat diatur pada varian yang disembunyikan atau dihapus.", 409);
    const regularPrice = managed ? Number(managed.price) : source?.promotion?.originalPrice ?? source?.price;
    const productSlug = managed?.product_slug ?? source?.productSlug;
    if (!regularPrice || !productSlug || Number(body.sale_price) >= regularPrice) {
      throw new HttpException("Varian tidak tersedia atau harga promo tidak lebih rendah dari harga jual reguler.", 400);
    }
    this.product(access, productSlug);
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
