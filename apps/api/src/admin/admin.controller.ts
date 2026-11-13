import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb, type ManagedProduct } from "./admin-store";
import { CatalogController } from "../catalog/catalog.controller";

@Controller("admin")
export class AdminController {
  private readonly catalogReader = new CatalogController();
  private async authorize(req: Request, res: Response, write = false) {
    res.setHeader("Cache-Control", "no-store");
    if (write && !(process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",").map(v => v.trim()).includes(req.headers.origin || "")) throw new HttpException("Origin tidak diizinkan.", 403);
    const allowed = (process.env.ADMIN_USER_IDS || "").split(",").map(v => v.trim()).filter(Boolean);
    if (!allowed.length) throw new HttpException("Akses admin belum dikonfigurasi. Isi ADMIN_USER_IDS di server dengan UUID akun administrator.", 503);
    const token = /(?:^|;\s*)anres_access=([^;]+)/.exec(req.headers.cookie || "")?.[1];
    if (!token) throw new HttpException("Masuk dengan akun administrator melalui website, lalu muat ulang dashboard.", 401);
    const url = process.env.SUPABASE_URL?.replace(/\/$/, ""), key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new HttpException("Autentikasi server belum dikonfigurasi.", 503);
    let response: globalThis.Response;
    try { response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(8000) }); }
    catch { throw new HttpException("Verifikasi akses admin tidak tersedia.", 503); }
    if (!response.ok) throw new HttpException("Sesi berakhir. Masuk kembali melalui website.", 401);
    const user = await response.json() as { id?: string };
    if (!user.id || !allowed.includes(user.id)) throw new HttpException("Akun ini tidak memiliki akses administrator.", 403);
    return user.id;
  }

  @Get("session")
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const id = await this.authorize(req, res);
    return { id, catalogEnabled: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Get("records/:kind")
  async records(@Param("kind") kind: string, @Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authorize(req, res);
    const tables: Record<string, [string, string]> = {
      orders: ["orders", "id,user_id,created_at,payment_method,items"],
      payments: ["sandbox_payments", "id,created_at,source,product_name,provider_code,target,amount,method,reference,status"],
      support: ["support_requests", "id,created_at,name,email,message,status"],
      products: ["managed_products", "*"],
    };
    const table = tables[kind];
    if (!table) throw new HttpException("Data tidak tersedia.", 404);
    const index = Number(page || 0);
    if (!Number.isSafeInteger(index) || index < 0 || index > 100000) throw new HttpException("Halaman tidak valid.", 400);
    const rows = await adminDb(table[0], `?select=${table[1]}&order=created_at.desc&limit=51&offset=${index * 50}`);
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50, page: index };
  }

  @Get("catalog/:category")
  async catalog(@Param("category") category: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authorize(req, res);
    return this.catalogReader.list(category);
  }

  @Post("products")
  async saveProduct(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authorize(req, res, true);
    const body = input as ManagedProduct;
    const string = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
    if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
      !string(body.provider, 60) || !/^[a-z0-9_-]+$/.test(body.provider) || !string(body.provider_code, 120) || !/^[A-Za-z0-9._-]+$/.test(body.provider_code) ||
      !["game", "prepaid", "apps"].includes(body.category) || !string(body.product, 100) || !string(body.name, 200) ||
      !string(body.product_slug, 100) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.product_slug) ||
      !Number.isSafeInteger(body.price) || body.price < 1 || body.price > 100000000 || typeof body.active !== "boolean" ||
      typeof body.description !== "string" || body.description.length > 2000 || /[<>\u0000-\u001f]/.test(body.description)) throw new HttpException("Periksa data produk, kode provider, slug, dan harga rupiah.", 400);
    const { id, provider, provider_code, category, product, product_slug, name, price, description, active } = body;
    // Reopening a provider variant must update its existing record even when it is
    // outside the current admin page. Keep its public managed.<UUID> code stable.
    const [existing] = await adminDb<ManagedProduct>("managed_products", `?provider=eq.${provider}&category=eq.${category}&provider_code=eq.${provider_code}&select=id&limit=1`);
    const [row] = await adminDb("managed_products", "?on_conflict=id", "POST", { id: existing?.id ?? id, provider, provider_code, category, product, product_slug, name, price, description, active, updated_at: new Date().toISOString() });
    return { product: row, published: process.env.ADMIN_CATALOG_ENABLED === "true" };
  }

  @Patch("support/:id")
  async support(@Param("id") id: string, @Body() body: { status?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authorize(req, res, true);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !["new", "in_progress", "closed"].includes(String(body?.status))) throw new HttpException("Status bantuan tidak valid.", 400);
    const [row] = await adminDb("support_requests", `?id=eq.${id}`, "PATCH", { status: body.status });
    if (!row) throw new HttpException("Permintaan tidak ditemukan.", 404);
    return row;
  }
}
