import { Body, Controller, Get, HttpException, Param, Post, Query, Req, Res } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { PaymentIdentityService } from "../payments/payment-identity";
import { adminDb } from "../admin/admin-store";
import { HelpController } from "./help.controller";
import { pageIndex, uuid } from "./conversations.controller";

type Message = {id:string;role:"user"|"assistant";content:string;created_at:string};
type Session = {id:string;owner_key:string;user_id:string|null;subject:string;messages:Message[];ticket_id:string|null;created_at:string;updated_at:string};
type Owner = {key:string;keys:string[];userId:string|null};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const visible=(room:Session|undefined)=>{
 if(!room) throw new HttpException("Sesi belum dapat disimpan. Coba lagi.",503);
 const {owner_key: _owner,user_id: _user,...session}=room;
 return session;
};

@Controller("help/ai-sessions")
export class AiSessionsController {
 private identity=new PaymentIdentityService();
 private ai=new HelpController();
 private attempts=new Map<string,{count:number;until:number}>();
 private limit(req:Request) {
  const now=Date.now(),key=req.ip || req.socket?.remoteAddress || "unknown";
  for(const [key,value] of this.attempts)if(value.until<=now)this.attempts.delete(key);
  const entry=this.attempts.get(key);
  if((entry?.count || 0)>=20 || (!entry && this.attempts.size>=10000)) throw new HttpException("Terlalu banyak sesi baru. Coba lagi sebentar.",429);
  this.attempts.set(key,{count:(entry?.count || 0)+1,until:entry?.until || now+60000});
 }
 private async owner(req:Request,res:Response,write=false):Promise<Owner> {
  res.setHeader("Cache-Control","no-store");
  if(write && !(process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",").map(s=>s.trim()).includes(req.headers.origin || "")) throw new HttpException("Origin tidak diizinkan.",403);
  const identity=await this.identity.resolve(req);
  const key=identity.userId ? digest(identity.userId) : identity.guestHash ? digest(identity.guestHash) : (await this.identity.establish(req,res)).scope;
  // A guest may sign in and convert the session they started in this browser.
  return {key,keys:[...new Set([key,...(identity.guestHash ? [digest(identity.guestHash)] : [])])],userId:identity.userId};
 }
 private async room(id:string,owner:Owner) {
  if(!uuid(id)) throw new HttpException("Sesi tidak valid.",400);
  const [room]=await adminDb<Session>("ai_help_sessions",`?id=eq.${id}&owner_key=in.(${owner.keys.join(",")})&select=*`);
  if(!room || (room.user_id && room.user_id!==owner.userId)) throw new HttpException("Sesi tidak ditemukan.",404);
  return room;
 }
 @Get() async list(@Query("page") page:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const owner=await this.owner(req,res),index=pageIndex(page);
  const rows=await adminDb<Session>("ai_help_sessions",`?owner_key=in.(${owner.keys.join(",")})&select=id,subject,ticket_id,created_at,updated_at&order=updated_at.desc,id.desc&limit=21&offset=${index*20}`);
  return {rows:rows.slice(0,20),hasMore:rows.length>20};
 }
 @Post() async create(@Body() input:{id?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const owner=await this.owner(req,res,true);
  if(!input || !uuid(input.id)) throw new HttpException("Sesi tidak valid.",400);
  this.limit(req);
  const [room]=await adminDb<Session>("rpc/create_ai_help_session","","POST",{p_id:input.id,p_owner:owner.key,p_user:owner.userId});
  if(!room) throw new HttpException("Sesi belum dapat dibuat.",503);
  if(!room) throw new HttpException("Sesi gagal dibuat. Coba periksa riwayat sebelum mengulang.",503);
  return visible(room);
 }
 @Get(":id") async read(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  return visible(await this.room(id,await this.owner(req,res)));
 }
 @Post(":id/messages") async send(@Param("id") id:string,@Body() input:{id?:unknown;content?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const owner=await this.owner(req,res,true),room=await this.room(id,owner);
  if(!input || !uuid(input.id) || typeof input.content!=="string" || !input.content.trim() || input.content.length>1500) throw new HttpException("Pesan harus berisi 1–1500 karakter.",400);
  const content=input.content.trim(),existing=room.messages.find(m=>m.id===input.id);
  if(existing) {if(existing.content!==content) throw new HttpException("ID pesan sudah digunakan.",409); return visible(room);}
  if(room.ticket_id) throw new HttpException("Sesi sudah dialihkan ke CS. Buka tiket atau mulai sesi AI baru.",409);
  if(room.messages.length>=200) throw new HttpException("Sesi penuh. Mulai sesi baru atau alihkan ke CS.",409);
  // The database is the source of history; clients cannot forge assistant turns.
  // Keep recent complete turns within a bounded context, preserving the full archive.
  const history:Message[]=[];let size=content.length;
  for(let i=room.messages.length-2;i>=0 && history.length<58;i-=2) {
   const pair=room.messages.slice(i,i+2),length=pair.reduce((n,m)=>n+m.content.length,0);
   if(size+length>48000) break;
   history.unshift(...pair);size+=length;
  }
  const handoff=/(?:hubung|bicara|ngobrol|sambung|alih|switch|convert|ubah|buat).*(?:cs|manusia|human|admin|tiket|ticket)|(?:cs|agen|agent)\s*(?:langsung|manusia|real)|(?:kurang|tidak|ga|gak|nggak) membantu|(?:mau|ingin|minta) (?:cs|tiket)/i.test(content);
  const {answer}=handoff?{answer:"Saya akan mengalihkan percakapan ini ke tiket CS. Login diperlukan agar tim CS dapat melanjutkan bantuan."}:await this.ai.chat({messages:[...history.map(({role,content})=>({role,content})),{role:"user",content}]},req);
  const [saved]=await adminDb<Session>("rpc/append_ai_help_turn","","POST",{p_id:id,p_owner:room.owner_key,p_version:room.messages.length,p_turn:input.id,p_question:content,p_answer:answer});
  if(!saved) throw new HttpException("Pesan belum dapat disimpan.",503);
  if(!saved) throw new HttpException("Sesi berubah. Muat ulang sebelum mengirim ulang.",409);
  return visible(saved);
 }
 @Post(":id/convert") async convert(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
  const owner=await this.owner(req,res,true);
  if(!owner.userId) throw new HttpException("Masuk terlebih dahulu untuk mengalihkan sesi ke CS. Riwayat AI tetap tersimpan.",401);
  const room=await this.room(id,owner);
  const [saved]=await adminDb<Session>("rpc/convert_ai_help_session","","POST",{p_id:id,p_owner:room.owner_key,p_user:owner.userId,p_account_owner:owner.key});
  if(!saved) throw new HttpException("Sesi belum dapat dialihkan.",503);
  if(!saved) throw new HttpException("Pengalihan belum terkonfirmasi. Muat ulang sesi sebelum mencoba lagi.",409);
  return visible(saved);
 }
}
