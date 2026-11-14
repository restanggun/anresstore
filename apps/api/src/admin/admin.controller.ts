import { featuredGameSlugs } from "../catalog/featured-games";
import { resolveSession, sessionAccessToken, writeSession } from "../auth/session";
import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb, type ManagedProduct } from "./admin-store";
import { CatalogController } from "../catalog/catalog.controller";
import { boundedFetch } from "../common/bounded-fetch";
import { uuid, pageIndex, messageInput } from "../help/conversations.controller";

@Controller("admin")
export class AdminController {
  private readonly catalogReader = new CatalogController();
  private async authorize(req: Request, res: Response, write = false, requireMfa = true) {
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
    const mfaRequired = process.env.NODE_ENV === "production" || process.env.ADMIN_REQUIRE_MFA !== "false";
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

  @Get("records/:kind")
  async records(@Param("kind") kind: string, @Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = await this.authorize(req, res);
    const tables: Record<string, [string, string]> = {
      orders: ["orders", "id,user_id,created_at,payment_method,items"],
      payments: ["sandbox_payments", "id,created_at,source,product_name,provider_code,target,amount,method,reference,status"],
      fulfillment: ["live_transactions", "id,created_at,updated_at,category,product_name,provider_code,target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,provider_reference,provider_note,payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone"],
      support: ["support_requests", "id,created_at,name,email,message,status"],
      products: ["managed_products", "*"],
      customers: ["users", "id,full_name,created_at,updated_at"],
      conversations: ["support_conversations", "*"],
    };
    const table = tables[kind];
    if (!table) throw new HttpException("Data tidak tersedia.", 404);
    this.permit(access, kind === "fulfillment" ? "orders.read" : kind === "conversations" ? "support.read" : `${kind}.read`);
    const index = Number(page || 0);
    if (!Number.isSafeInteger(index) || index < 0 || index > 100000) throw new HttpException("Halaman tidak valid.", 400);
    // Records other than products have no trustworthy service category: require all scopes.
    if (kind !== "products" && (access.categories.length < 5 || access.productSlugs.length)) throw new HttpException("Data ini memerlukan akses semua layanan.", 403);
    const scope = kind === "products" ? `&category=in.(${access.categories.filter(c => ["game", "prepaid", "apps", "social", "tasks"].includes(c)).join(",")})${access.productSlugs.length ? `&product_slug=in.(${access.productSlugs.join(",")})` : ""}` : "";
    if (kind === "products" && !access.categories.length) return { rows: [], hasMore: false, page: index };
    const rows = await adminDb(table[0], `?select=${table[1]}${scope}&order=created_at.desc&limit=51&offset=${index * 50}`);
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
    const access = await this.authorize(req, res); this.permit(access, "products.read"); this.category(access, category);
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
    const access=await this.authorize(req,res); this.permit(access,"support.read"); this.allServices(access);
    if(!uuid(id)) throw new HttpException("Percakapan tidak valid.",400);
    const index=pageIndex(page);
    const [room]=await adminDb("support_conversations",`?id=eq.${id}&select=*`);
    if(!room) throw new HttpException("Percakapan tidak ditemukan.",404);
    const rows=await adminDb("support_messages",`?conversation_id=eq.${id}&select=id,body,author_role,created_at&order=created_at.desc,id.desc&limit=51&offset=${index*50}`);
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
    if(order.payment_mode==="sandbox") {
      const [row]=await adminDb("sandbox_payments",`?id=eq.${id}`,"PATCH",{review_required:input.review});
      if(!row) throw new HttpException("Pesanan simulasi tidak ditemukan.",404);
    } else {
      const [row]=await adminDb("live_transactions",`?id=eq.${id}&payment_mode=eq.live&payment_status=eq.paid`,"PATCH",{review_required:input.review,updated_at:new Date().toISOString()});
      if(!row) throw new HttpException("Pesanan berubah. Muat ulang lalu coba lagi.",409);
    }
    return {ok:true,review_required:input.review};
  }

  @Patch("fulfillment/:id/manual")
  async manualFulfillment(@Param("id") id:string,@Body() body:{status?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res,true); this.permit(access,"orders.write"); this.allServices(access);
    if(!uuid(id) || !["processing","completed","failed"].includes(String(body?.status)) || typeof body.note!=="string" || !body.note.trim() || body.note.length>2000 || /[<>\u0000-\u001f]/.test(body.note)) throw new HttpException("Isi status dan catatan pengerjaan yang valid.",400);
    const [order]=await adminDb<{fulfillment_status:string}>("live_transactions",`?id=eq.${id}&fulfillment_mode=eq.manual&payment_mode=eq.live&payment_status=eq.paid&select=fulfillment_status`);
    if(!order || !["ready","processing","manual_review"].includes(order.fulfillment_status)) throw new HttpException("Pesanan manual belum lunas, masih sandbox, atau sudah berstatus akhir.",409);
    await this.audit(access.id,"order.manual_update",id);
    const [row]=await adminDb("live_transactions",`?id=eq.${id}&fulfillment_mode=eq.manual&payment_mode=eq.live&payment_status=eq.paid&fulfillment_status=eq.${order.fulfillment_status}`,"PATCH",{fulfillment_status:body.status,provider_note:body.note.trim(),updated_at:new Date().toISOString()});
    if(!row) throw new HttpException("Pesanan berubah. Muat ulang sebelum mencoba lagi.",409);
    return {ok:true};
  }

  @Get("analytics")
  async analytics(@Query("days") days:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    const access=await this.authorize(req,res); this.permit(access,"orders.read"); this.permit(access,"payments.read"); this.allServices(access);
    const period=Number(days || 30); if(![7,30,90].includes(period)) throw new HttpException("Periode tidak valid.",400);
    const [result]=await adminDb("rpc/admin_transaction_analytics","","POST",{p_days:period}); return result;
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
      !Number.isSafeInteger(body.price) || body.price < 1 || body.price > 100000000 || typeof body.active !== "boolean" ||
      typeof body.description !== "string" || body.description.length > 2000 || /[<>\u0000-\u001f]/.test(body.description)) throw new HttpException("Periksa data produk, kode provider, slug, dan harga rupiah.", 400);
    this.category(access, body.category);
    this.product(access, body.product_slug);
    const fulfillment_mode = body.provider === "vipayment" ? (body.fulfillment_mode || "vipayment") : "manual";
    const supplier_code = body.supplier_code || body.provider_code;
    const service_quantity = body.service_quantity ?? (body.category === "social" ? 1000 : 1);
    if (!["manual","vipayment"].includes(fulfillment_mode) || !/^[A-Za-z0-9._-]{1,120}$/.test(supplier_code) || !Number.isSafeInteger(service_quantity) || service_quantity < 1 || service_quantity > 10000000 || (body.category === "tasks" && body.provider === "vipayment")) throw new HttpException("Pemetaan provider atau jumlah layanan tidak valid.",400);
    if (body.provider === "vipayment" && (body.category === "social" || body.supplier_code)) {
      const source = (await this.catalogReader.list(body.category,true)).items.find(item=>item.code===supplier_code);
      if (source?.requiresManualReview && fulfillment_mode !== "manual") throw new HttpException("Layanan ini memerlukan pemrosesan manual oleh tim admin.",400);
      if (!source || (body.category === "social" && (service_quantity < source.minimum! || service_quantity > source.maximum!))) throw new HttpException("Layanan provider atau jumlah paket tidak tersedia.",400);
    }

    const { id, provider, provider_code, category, product, product_slug, name, price, description, active } = body;
    // Reopening a provider variant must update its existing record even when it is
    // outside the current admin page. Keep its public managed.<UUID> code stable.
    const [byId] = await adminDb<ManagedProduct>("managed_products", `?id=eq.${id}&select=id,category,product_slug&limit=1`);
    if (byId) { this.category(access, byId.category); this.product(access, byId.product_slug); }
    const [existing] = await adminDb<ManagedProduct>("managed_products", `?provider=eq.${provider}&category=eq.${category}&provider_code=eq.${provider_code}&select=id,product_slug&limit=1`);
    if (existing) this.product(access, existing.product_slug);
    await this.audit(access.id, "product.save", existing?.id ?? id);
    const [row] = await adminDb("managed_products", "?on_conflict=id", "POST", { id: existing?.id ?? id, provider, provider_code, category, product, product_slug, name, price, description, active, fulfillment_mode, supplier_code, service_quantity, updated_at: new Date().toISOString() });
    return { product: row, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
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
