import { Body, Controller, Get, HttpException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PaymentIdentityService } from "../payments/payment-identity";
import { adminDb } from "../admin/admin-store";

export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function pageIndex(value: string) { const n = Number(value || 0); if (!Number.isSafeInteger(n) || n < 0 || n > 100000) throw new HttpException("Halaman tidak valid.",400); return n; }
export function messageInput(body: {id?:unknown;body?:unknown}) {
 if (!body || !uuid(body.id) || typeof body.body !== "string" || !body.body.trim() || body.body.length > 3000) throw new HttpException("Pesan harus berisi 1–3000 karakter.",400);
 return {id:body.id,body:body.body.trim()};
}
@Controller("help/conversations")
export class ConversationsController {
 private identity = new PaymentIdentityService();
 private async user(req:Request,res:Response,write=false) {
  res.setHeader("Cache-Control","no-store");
  if(write && !(process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",").map(s=>s.trim()).includes(req.headers.origin || "")) throw new HttpException("Origin tidak diizinkan.",403);
  const {userId}=await this.identity.resolve(req,res); if(!userId) throw new HttpException("Masuk untuk membuka percakapan CS.",401); return userId;
 }
 @Get() async list(@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const user=await this.user(req,res), index=pageIndex(page);
  const rows=await adminDb("support_conversations",`?user_id=eq.${user}&select=*&order=created_at.desc,id.desc&limit=51&offset=${index*50}`);
  return {rows:rows.slice(0,50),hasMore:rows.length>50};
 }
 @Get("notifications") async notifications(@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const user=await this.user(req,res);
  const [summary]=await adminDb<{unread_count:number;recent:unknown[]}>("rpc/support_customer_notifications","","POST",{p_user:user});
  if(!summary) throw new HttpException("Notifikasi belum tersedia.",503);
  return {count:Number(summary.unread_count),recent:summary.recent};
 }
 @Post("notifications/read") async readNotifications(@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const user=await this.user(req,res,true);
  await adminDb("support_conversations",`?user_id=eq.${user}&select=id`,"PATCH",{customer_read_at:new Date().toISOString()});
  return {read:true};
 }
 @Post() async create(@Body() input:{id?:unknown;subject?:unknown;body?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const user=await this.user(req,res,true);
  if(!input || !uuid(input.id) || typeof input.subject!=="string" || input.subject.trim().length<3 || input.subject.length>160) throw new HttpException("Isi subjek 3–160 karakter.",400);
  if(input.body!==undefined && (typeof input.body!=="string" || input.body.length>3000)) throw new HttpException("Rincian maksimal 3000 karakter.",400);
  const [existing]=await adminDb<{user_id:string}>("support_conversations",`?id=eq.${input.id}&select=user_id`);
  if(existing) { if(existing.user_id!==user) throw new HttpException("Nomor percakapan tidak tersedia.",409); return {id:input.id}; }
  await adminDb("rpc/create_support_ticket","","POST",{p_id:input.id,p_user:user,p_subject:input.subject.trim(),p_body:typeof input.body==="string"?input.body.trim():null}); return {id:input.id};
 }
 @Get(":id/messages") async messages(@Param("id") id:string,@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const readAt=new Date().toISOString();
  const user=await this.user(req,res),index=pageIndex(page);
  if(!uuid(id)) throw new HttpException("Percakapan tidak valid.",400);
  const [room]=await adminDb("support_conversations",`?id=eq.${id}&user_id=eq.${user}&select=*`);
  if(!room) throw new HttpException("Percakapan tidak ditemukan.",404);
  const rows=await adminDb("support_messages",`?conversation_id=eq.${id}&select=id,body,author_role,created_at&order=created_at.desc,id.desc&limit=51&offset=${index*50}`);
  if(index===0) await adminDb("support_conversations",`?id=eq.${id}&user_id=eq.${user}`,"PATCH",{customer_read_at:readAt});
  return {room,rows:rows.slice(0,50).reverse(),hasMore:rows.length>50};
 }
 @Post(":id/messages") async send(@Param("id") id:string,@Body() input:{id?:unknown;body?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const user=await this.user(req,res,true),message=messageInput(input);
  if(!uuid(id)) throw new HttpException("Percakapan tidak valid.",400);
  const [room]=await adminDb("support_conversations",`?id=eq.${id}&user_id=eq.${user}&select=status`);
  if(!room) throw new HttpException("Percakapan tidak ditemukan.",404);
  if(["closed","rejected"].includes(String(room.status))) throw new HttpException("Tiket tidak aktif. Buka tiket baru.",409);
  return {rows:await adminDb("rpc/append_support_message","","POST",{p_id:message.id,p_room:id,p_actor:user,p_role:"customer",p_body:message.body})};
 }
}
