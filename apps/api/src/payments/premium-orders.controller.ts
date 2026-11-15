import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PaymentIdentityService } from "./payment-identity";
import { CatalogController } from "../catalog/catalog.controller";
import { adminDb } from "../admin/admin-store";
import { uuid } from "../help/conversations.controller";
import { PaymentStore } from "./payment-store";

export function premiumImage(value:unknown):string {
 if(typeof value!=="string" || value.length>150000) throw new HttpException("Gambar maksimal 100 KB.",400);
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match) throw new HttpException("Gunakan gambar PNG, JPEG, atau WebP.",400);
 const bytes=Buffer.from(match[2]!,"base64");
 if(bytes.length<16 || bytes.length>100000 || bytes.toString("base64")!==match[2] ||
   !(match[1]==="png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
     match[1]==="jpeg" && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ||
     match[1]==="webp" && bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP")) throw new HttpException("File gambar tidak valid.",400);
 return value;
}

@Controller("premium-orders")
export class PremiumOrdersController {
 private readonly identity=new PaymentIdentityService();
 private readonly catalog=new CatalogController();
 private readonly store=new PaymentStore();
 private async owner(req:Request,res:Response,write=false){
  res.setHeader("Cache-Control","no-store");
  if(write && !(process.env.CORS_ORIGINS||"http://localhost:3000,http://localhost:3001").split(",").map(s=>s.trim()).includes(req.headers.origin||"")) throw new HttpException("Origin tidak diizinkan.",403);
  const {userId}=await this.identity.resolve(req,res);
  if(!userId) throw new HttpException("Masuk ke akun untuk membeli aplikasi premium.",401);
  return userId;
 }
 private async order(id:string,user:string){
  if(!uuid(id)) throw new HttpException("Pesanan tidak ditemukan.",404);
  const [row]=await adminDb<Record<string,unknown>>("premium_orders",`?id=eq.${id}&user_id=eq.${user}&payment_mode=eq.live&select=*`);
  if(!row) throw new HttpException("Pesanan tidak ditemukan.",404);
  return row;
 }
 @Get("product/:id") async productRule(@Param("id") id:string,@Res({passthrough:true}) res:Response){
  res.setHeader("Cache-Control","no-store");
  if(!uuid(id))throw new HttpException("Paket tidak tersedia.",404);
  const catalog=await this.catalog.list("apps");
  if(!catalog.items.some(item=>item.code===`managed.${id}`&&item.fulfillmentMode==="manual"))throw new HttpException("Paket tidak tersedia.",404);
  const [rule]=await adminDb<{access_type:string;duration_days:number;guarantee_days:number;guarantee_terms:string;updated_at:string}>("premium_product_rules",`?product_id=eq.${id}&select=access_type,duration_days,guarantee_days,guarantee_terms,updated_at`);
  if(!rule)throw new HttpException("Ketentuan paket belum diatur.",503);
  const [qris]=await adminDb<{image:string}>("premium_qris_settings","?id=eq.1&select=image");
  if(!qris)throw new HttpException("QRIS dinamis belum diatur admin.",503);
  return rule;
 }
 @Post() async create(@Body() input:{id?:unknown;code?:unknown;expectedAmount?:unknown;expectedRuleAt?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res,true);
  if(!uuid(input?.id)||typeof input.code!=="string"||!/^managed\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.code)||!Number.isSafeInteger(input.expectedAmount)||Number(input.expectedAmount)<1||typeof input.expectedRuleAt!=="string"||!Number.isFinite(Date.parse(input.expectedRuleAt)))throw new HttpException("Paket aplikasi tidak valid.",400);
  if(await this.store.rpc<boolean>("consume_payment_rate",{p_key:`premium:${user}`,p_limit:10,p_seconds:3600})!==true)throw new HttpException("Terlalu banyak pesanan. Coba lagi nanti.",429);
  const catalog=await this.catalog.list("apps");
  const product=catalog.items.find(row=>row.code===input.code);
  if(!product || product.price!==input.expectedAmount || product.fulfillmentMode!=="manual")throw new HttpException("Paket atau harga berubah. Muat ulang katalog.",409);
  const [order]=await adminDb("rpc/reserve_premium_order","","POST",{p_id:input.id,p_user:user,p_product:input.code.slice(8),p_amount:product.price,p_rule_updated_at:input.expectedRuleAt});
  const [qris]=await adminDb<{image:string}>("premium_qris_settings","?id=eq.1&select=image");
  if(!qris)throw new HttpException("QRIS dinamis belum diatur admin.",503);
  const [prepared]=await adminDb("rpc/prepare_premium_order","","POST",{p_order:input.id,p_user:user});
  if(!prepared)throw new HttpException("QRIS pesanan belum dapat disiapkan. Periksa status sebelum mencoba lagi.",503);
  return {order:prepared};
 }
 @Get() async list(@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res);
  const rows=await adminDb("premium_orders",`?user_id=eq.${user}&payment_mode=eq.live&select=id,product_name,amount,status,created_at&order=created_at.desc&limit=100`);
  return {rows};
 }
 @Get(":id") async detail(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res),order=await this.order(id,user);
  const [claim]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&select=*`);
  return {order,claim:claim??null};
 }
 @Post(":id/proof") async proof(@Param("id") id:string,@Body() input:{image?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res,true),order=await this.order(id,user);
  if(order.status!=="awaiting_payment" || typeof order.qr_expires_at!=="string" || Date.parse(order.qr_expires_at)<=Date.now())throw new HttpException("QRIS belum tersedia atau sudah kedaluwarsa.",409);
  const image=premiumImage(input?.image),note=typeof input?.note==="string"?input.note.trim():"";
  if(note.length>500)throw new HttpException("Catatan terlalu panjang.",400);
  const [saved]=await adminDb("premium_orders",`?id=eq.${id}&user_id=eq.${user}&payment_mode=eq.live&status=eq.awaiting_payment&qr_expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,"PATCH",{proof_image:image,proof_note:note,status:"proof_submitted",updated_at:new Date().toISOString()});
  if(!saved)throw new HttpException("Status pesanan berubah. Muat ulang.",409);
  return {order:saved};
 }
 @Post(":id/claim") async claim(@Param("id") id:string,@Body() input:{id?:unknown;reason?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res,true),order=await this.order(id,user);
  if(!uuid(input?.id)||typeof input.reason!=="string"||input.reason.trim().length<10||input.reason.length>2000)throw new HttpException("Alasan klaim tidak valid.",400);
  if(order.status!=="delivered"||typeof order.delivered_at!=="string"||Date.now()>Date.parse(order.delivered_at)+Number(order.guarantee_days)*86400000)throw new HttpException("Masa garansi sudah berakhir atau pesanan belum dikirim.",409);
  const [existing]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&select=id`);
  if(existing)throw new HttpException("Klaim garansi untuk pesanan ini sudah ada.",409);
  const [claim]=await adminDb("premium_guarantee_claims","","POST",{id:input.id,order_id:id,reason:input.reason.trim()});
  return {claim};
 }
}
