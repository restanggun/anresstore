import { resolveSession, writeSession } from "./session";
﻿import { Controller, Get, Post, Body, Req, Res, HttpException, BadRequestException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { boundedFetch as fetch } from "../common/bounded-fetch";
import { paymentCookies } from "../payments/payment-identity";
import { PaymentStore } from "../payments/payment-store";
import { supportInvoiceReference } from "../help/support-invoice-reference";

import { Param, Query } from "@nestjs/common";

@Controller("auth")
export class AuthController {
 private readonly campaignStore = new PaymentStore();
 private config() { const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY; const web = process.env.AUTH_WEB_ORIGIN || "http://localhost:3000"; const api = process.env.AUTH_API_ORIGIN || "http://localhost:4000"; if (!url || !key) throw new HttpException("Konfigurasi autentikasi API belum lengkap.", 503); return {url:url.replace(/\/$/, ""), key, web, api}; }
 private cookies(req: Request) { return paymentCookies(req); }
 private options(maxAge: number) { return {httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"lax" as const, path:"/", maxAge}; }
 private async request(path:string, body?:unknown, token?:string, method="POST") { const {url,key}=this.config(); const response=await fetch(`${url}/auth/v1/${path}`, {method, headers:{apikey:key, "Content-Type":"application/json", ...(token ? {Authorization:`Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body:JSON.stringify(body)})}); const data = await response.json().catch(() => ({})) as Record<string, any>; if(!response.ok) throw new HttpException(data.msg || data.error_description || data.message || "Autentikasi gagal.", response.status); return data; }
 private session(req:Request,res:Response,data:Record<string,any>) { if(data.access_token && data.refresh_token) writeSession(req,res,data); }
 private async authenticated(req:Request,res:Response) { return resolveSession(req,res); }
 private pkce(res:Response, kind:string) { const verifier=randomBytes(48).toString("base64url"); res.cookie("anres_verifier",verifier,this.options(600000)); res.cookie("anres_auth_kind",kind,this.options(600000)); return createHash("sha256").update(verifier).digest("base64url"); }
 private validateOrigin(req:Request) { const origin=req.headers.origin; const allowed=(process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",").map(x=>x.trim()); if(!origin || !allowed.includes(origin)) throw new HttpException("Origin tidak diizinkan.",403); }
 private checkAttempts = new Map<string,{count:number;until:number}>();
 private limitCheck(req:Request) { const now=Date.now(); for(const [key,value] of this.checkAttempts) if(value.until<=now) this.checkAttempts.delete(key); const ip=`${req.path || "verification"}:${req.ip || req.socket.remoteAddress || "unknown"}`; const entry=this.checkAttempts.get(ip); if(entry && entry.count>=10) throw new HttpException("Terlalu banyak percobaan. Coba lagi nanti.",429); this.checkAttempts.set(ip,entry ? {...entry,count:entry.count+1} : {count:1,until:now+60000}); }
 @Post("check-email") async checkEmail(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { res.setHeader("Cache-Control","no-store"); this.validateOrigin(req); this.limitCheck(req); const email=(body as {email?:unknown})?.email; if(typeof email !== "string" || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new BadRequestException("Masukkan email yang valid."); const {url}=this.config(); const secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; if(!secret) throw new HttpException("Pemeriksaan akun belum dikonfigurasi.",503); const response=await fetch(`${url}/rest/v1/rpc/lookup_auth_methods`,{method:"POST",headers:{apikey:secret,...(secret.startsWith("sb_secret_") ? {} : {Authorization:`Bearer ${secret}`}),"Content-Type":"application/json"},body:JSON.stringify({p_email:email.trim().toLowerCase()})}); if(!response.ok) throw new HttpException("Pemeriksaan akun tidak tersedia.",503); return response.json(); }
 @Post("send-login-code") async sendLoginCode(@Body() body:unknown,@Req() req:Request) { this.validateOrigin(req); this.limitCheck(req); const email=(body as {email?:unknown})?.email; if(typeof email !== "string" || !email.trim()) throw new BadRequestException("Email wajib diisi."); await this.request("otp",{email:email.trim(),create_user:false}); return {ok:true}; }
 @Post("verify-login-code") async verifyLoginCode(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); this.limitCheck(req); const {email,token}=(body || {}) as {email?:unknown;token?:unknown}; if(typeof email !== "string" || !email.trim() || typeof token !== "string" || !/^\d{6}$/.test(token)) throw new BadRequestException("Masukkan email dan kode yang valid."); const data=await this.request("verify",{email:email.trim(),token,type:"email"}); if(!data.access_token || !data.refresh_token) throw new HttpException("Kode tidak valid atau sudah kedaluwarsa.",401); this.session(req,res,data); return {ok:true}; }
 @Post("login") async login(@Body() body:{email:string;password:string},@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); this.limitCheck(req); if(!body?.email || !body?.password) throw new BadRequestException("Email dan password wajib diisi."); const data=await this.request("token?grant_type=password",{email:body.email,password:body.password}); this.session(req,res,data); return {user:data.user}; }
 @Post("referral-visit") async referralVisit(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req);const ip=req.ip||req.socket.remoteAddress||"unknown";const allowed=await this.campaignStore.rpc<boolean>("consume_payment_rate",{p_key:"auth-referral:"+createHash("sha256").update(ip).digest("hex"),p_limit:30,p_seconds:3600});if(!allowed)throw new HttpException("Terlalu banyak permintaan. Coba lagi nanti.",429); const code=(body as {code?:unknown})?.code; if(typeof code!=="string"||!/^[a-f0-9]{16}$/i.test(code)) throw new BadRequestException("Kode referral tidak valid."); const result=await this.campaignStore.request<boolean[]>("referral_profiles?code=eq."+encodeURIComponent(code.toUpperCase())+"&select=code&limit=1"); if(!result.length) throw new HttpException("Kode ajakan tidak ditemukan.",404); res.cookie(process.env.NODE_ENV==="production"?"__Host-anres_referral":"anres_referral",code.toUpperCase(),this.options(7*86400000)); return {accepted:true}; }
 @Post("register") async register(@Body() body:{email:string;password:string;name:string},@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); if(!body.email || !body.password || body.password.length<8 || !body.name?.trim()) throw new BadRequestException("Periksa data pendaftaran."); const data=await this.request("signup",{email:body.email,password:body.password,data:{full_name:body.name.trim()}}); this.session(req,res,data); const referralCookie=process.env.NODE_ENV==="production"?"__Host-anres_referral":"anres_referral"; const code=this.cookies(req)[referralCookie]; if(data.user?.id&&Array.isArray(data.user.identities)&&data.user.identities.length>0&&code) try { await this.campaignStore.rpc("capture_referral_attribution",{p_user:data.user.id,p_code:code}); } catch { /* A referral write failure must not undo a completed signup. */ } if(data.user?.id&&data.user.email_confirmed_at)try{await this.campaignStore.rpc("activate_referral_attribution",{p_user:data.user.id});}catch{/* Signup success is independent from campaign availability. */} res.clearCookie(referralCookie,{path:"/"}); return {authenticated:!!data.access_token}; }
 @Post("confirm-signup") async confirmSignup(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); this.limitCheck(req); const {email,token}=(body || {}) as {email?:unknown;token?:unknown}; if(typeof email !== "string" || !email.trim() || typeof token !== "string" || !/^\d{6}$/.test(token)) throw new BadRequestException("Masukkan email dan kode konfirmasi yang valid."); const data=await this.request("verify",{email:email.trim(),token,type:"signup"}); if(!data.access_token || !data.refresh_token) throw new HttpException("Konfirmasi tidak menghasilkan sesi. Silakan masuk.",401); this.session(req,res,data); if(typeof data.user?.id==="string") await this.campaignStore.rpc("activate_referral_attribution",{p_user:data.user.id}); return {ok:true}; }
 @Post("resend-signup") async resendSignup(@Body() body:unknown,@Req() req:Request) { this.validateOrigin(req); const email=(body as {email?:unknown})?.email; if(typeof email !== "string" || !email.trim()) throw new BadRequestException("Email wajib diisi."); await this.request("resend",{type:"signup",email:email.trim()}); return {ok:true}; }
 @Post("recover") async recover(@Body() body:unknown,@Req() req:Request) { this.validateOrigin(req); this.limitCheck(req); const email=(body as {email?:unknown})?.email; if(typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length>254) throw new BadRequestException("Email tidak valid."); await this.request("recover",{email:email.trim().toLowerCase()}); return {ok:true}; }
 private adminOrigin() { const origin=process.env.AUTH_ADMIN_ORIGIN || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001"); const allowed=(process.env.ADMIN_ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001")).split(",").map(value=>value.trim()); try { const parsed=new URL(origin); if(parsed.origin !== origin || !["http:","https:"].includes(parsed.protocol) || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") || !allowed.includes(origin)) throw new Error(); return origin; } catch { throw new HttpException("Origin login admin belum dikonfigurasi.",503); } }
 @Get("google")
 google(@Res() res: Response, @Query("app") app?: string, @Query("supportInvoice") supportInvoice?: string) {
  const { url, api } = this.config();
  const admin = app === "admin";
  if (admin) this.adminOrigin();
  const challenge = this.pkce(res, admin ? "google_admin" : "google");
  const invoice = admin ? null : supportInvoiceReference(supportInvoice);
  if (invoice) res.cookie("anres_support_invoice", invoice, this.options(600000));
  else res.clearCookie("anres_support_invoice", { path: "/" });
  const params = new URLSearchParams({ provider: "google", redirect_to: `${api}/v1/auth/callback`,
    code_challenge: challenge, code_challenge_method: "s256", prompt: "select_account" });
  return res.redirect(`${url}/auth/v1/authorize?${params}`);
 }

 @Get("callback")
 async callback(@Req() req: Request, @Res() res: Response) {
  const { web } = this.config();
  const cookies = this.cookies(req);
  const admin = cookies.anres_auth_kind === "google_admin";
  const recovery = cookies.anres_auth_kind === "recovery";
  const authOrigin = process.env.AUTH_AUTH_ORIGIN || web;
  const destination = admin ? this.adminOrigin() : recovery ? authOrigin : process.env.AUTH_APP_ORIGIN || web;
  const invoice = cookies.anres_auth_kind === "google" ? supportInvoiceReference(cookies.anres_support_invoice) : null;
  res.clearCookie("anres_support_invoice", { path: "/" });
  try {
   const code = typeof req.query.code === "string" ? req.query.code : "";
   if (!code || !cookies.anres_verifier) throw new Error("Link tidak berlaku atau dibuka di browser lain.");
   const data = await this.request("token?grant_type=pkce", { auth_code: code, code_verifier: cookies.anres_verifier });
   this.session(req, res, data);
   res.clearCookie("anres_verifier", { path: "/" });
   res.clearCookie("anres_auth_kind", { path: "/" });
   if (recovery) res.cookie("anres_recovery", "1", this.options(600000));
   if (invoice) return res.redirect(new URL(`/bantuan?invoice=${encodeURIComponent(invoice)}#support-inbox`, web).href);
   return res.redirect(`${destination}${recovery ? "/auth/reset-password" : admin ? "/" : "/dashboard"}`);
  } catch {
   const params = new URLSearchParams({ auth_error: "callback" });
   if (invoice) params.set("supportInvoice", invoice);
   return res.redirect(`${admin ? destination : authOrigin}${admin ? "/" : "/login"}?${params}`);
  }
 }
 @Get("session") async getSession(@Req() req:Request,@Res({passthrough:true}) res:Response) { try { const {user}=await this.authenticated(req,res); return {user:{id:user.id, email:user.email, name:user.user_metadata?.full_name || ""}}; } catch { return {user:null}; } }
 private async profileData(req:Request,res:Response,fullName?:string) {
  const {user,token}=await this.authenticated(req,res); const {url,key}=this.config();
  if(typeof user.id !== "string") throw new HttpException("Silakan masuk kembali.",401);
  const headers:Record<string,string>={apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  let response:globalThis.Response;
  if(fullName !== undefined) { response=await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`,{method:"PATCH",headers:{...headers,Prefer:"return=representation"},body:JSON.stringify({full_name:fullName,updated_at:new Date().toISOString()})}); }
  else { response=await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}&select=full_name`,{headers}); }
  if(!response.ok) throw new HttpException("Profil tidak dapat diakses.",503);
  const rows=await response.json() as Array<{full_name:string}>;
  if(!rows.length) throw new HttpException("Data pengguna belum tersedia.",503);
  const name=typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  return {user:{id:user.id,email:user.email || "",name},fullName:rows[0]?.full_name || name};
 }
 @Get("profile") async profile(@Req() req:Request,@Res({passthrough:true}) res:Response) { return this.profileData(req,res); }
 private async cartData(req:Request,res:Response,action:"load"|"merge"|"save",items:unknown = [],version?:unknown,expectedUser?:unknown) {
  const {user,token}=await this.authenticated(req,res); const {url,key}=this.config();
  if(typeof user.id !== "string") throw new HttpException("Silakan masuk kembali.",401);
  if(action !== "load" && expectedUser !== user.id) throw new HttpException("Sesi telah berubah. Muat ulang halaman.",409);
  if(!Array.isArray(items) || items.length > 100 || items.some(item => !item || typeof item !== "object" || !["id","product","category","details","target","contact"].every(k => typeof item[k] === "string" && item[k].length <= (k === "id" ? 100 : 2000)) || !item.id || !Number.isFinite(item.price) || item.price < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) || (action === "save" && (!Number.isSafeInteger(version) || (version as number) < 0))) throw new BadRequestException("Data keranjang tidak valid.");
  const headers:Record<string,string>={apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const response=await fetch(`${url}/rest/v1/rpc/apply_cart`,{method:"POST",headers,body:JSON.stringify({p_action:action,p_items:items,p_version:version ?? null})});
  if(!response.ok) throw new HttpException("Keranjang tidak dapat disimpan atau dimuat.",503);
  return {...await response.json() as object,userId:user.id};
 }
 @Get("cart") async cart(@Req() req:Request,@Res({passthrough:true}) res:Response) { return this.cartData(req,res,"load"); }
 @Post("cart") async saveCart(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); const data=body as {items?:unknown;action?:unknown;version?:unknown;userId?:unknown}; if(!data || !["merge","save"].includes(data.action as string) || data.items === undefined) throw new BadRequestException("Data keranjang wajib diisi."); return this.cartData(req,res,data.action as "merge"|"save",data.items,data.version,data.userId); }
 @Get("orders") async orders(@Req() _req:Request,@Res({passthrough:true}) _res:Response) { throw new HttpException("Gunakan riwayat invoice melalui /v1/payments/history.",410); }
 @Get("orders/:id") async order(@Param("id") _id:string,@Req() _req:Request,@Res({passthrough:true}) _res:Response) { throw new HttpException("Gunakan invoice melalui /v1/payments/transactions/:id.",410); }
 @Post("orders") async createOrder(@Body() _body:unknown,@Req() _req:Request,@Res({passthrough:true}) _res:Response) { throw new HttpException("Checkout lama dinonaktifkan. Buat invoice melalui /v1/payments/transactions.",410); }
 @Post("profile") async updateProfile(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); const name=(body as {fullName?:unknown})?.fullName; if(typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new BadRequestException("Nama wajib diisi, maksimal 100 karakter."); return this.profileData(req,res,name.trim()); }
 @Post("reset-password") async reset(@Body() body:unknown,@Req() req:Request) { this.validateOrigin(req); this.limitCheck(req); const {email,token,password}=(body || {}) as {email?:unknown;token?:unknown;password?:unknown}; if(typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length>254 || typeof token !== "string" || !/^\d{6}$/.test(token) || typeof password !== "string" || password.length<8 || password.length>256) throw new BadRequestException("Periksa email, kode, dan password minimal 8 karakter."); const data=await this.request("verify",{email:email.trim().toLowerCase(),token,type:"recovery"}); if(typeof data.access_token !== "string" || !data.access_token) throw new HttpException("Kode tidak valid atau kedaluwarsa.",401); try { await this.request("user",{password},data.access_token,"PUT"); } catch { throw new HttpException("Password gagal diperbarui. Minta kode baru dan coba lagi.",502); } return {ok:true}; }
 @Post("logout") async logout(@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); try { const {token}=await this.authenticated(req,res); await this.request("logout",{},token); } finally { for(const name of ["anres_access","anres_refresh","anres_persist","anres_recovery","anres_verifier","anres_auth_kind"]) res.clearCookie(name,{path:"/"}); } return {ok:true}; }
}
