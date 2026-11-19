import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PaymentIdentityService } from "./payment-identity";
import { CatalogController } from "../catalog/catalog.controller";
import { adminDb } from "../admin/admin-store";
import { uuid, messageInput } from "../help/conversations.controller";
import { PaymentStore } from "./payment-store";
import { qrisForAmount } from "./qris-payload";
import { parseVoucher, promotedProduct } from "./vouchers";
import { paymentHash } from "./payment-contract";
import QRCode from "qrcode";

export function premiumImage(value:unknown,maxBytes=100000):string {
 if(typeof value!=="string" || value.length>Math.ceil(maxBytes/3)*4+64) throw new HttpException(`Gambar maksimal ${maxBytes===100000?"100 KB":"10 MB"}.`,400);
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match) throw new HttpException("Gunakan gambar PNG, JPEG, atau WebP.",400);
 const bytes=Buffer.from(match[2]!,"base64");
 if(bytes.length<16 || bytes.length>maxBytes || bytes.toString("base64")!==match[2] ||
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
  const identity=await this.identity.resolve(req,res);
  if(!identity.userId&&!identity.guestHash) identity.guestHash=(await this.identity.establish(req,res)).guestHash??null;
  const resolved=identity;
  if(!resolved.userId&&!resolved.guestHash) throw new HttpException("Sesi guest tidak tersedia. Muat ulang halaman.",401);
  return resolved;
 }
 private async order(id:string,identity:{userId:string|null;guestHash:string|null}){
  if(!uuid(id)) throw new HttpException("Pesanan tidak ditemukan.",404);
  const ownership=identity.userId?`user_id=eq.${identity.userId}`:`guest_session_hash=eq.${identity.guestHash}`;
  const [row]=await adminDb<Record<string,unknown>>("premium_orders",`?id=eq.${id}&${ownership}&payment_mode=eq.live&select=*`);
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
  return rule;
 }
 @Post() async create(@Body() input:{id?:unknown;code?:unknown;expectedAmount?:unknown;expectedRuleAt?:unknown;email?:unknown;phone?:unknown;voucher?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res,true),user=identity.userId;
  const email=String(identity.email||(typeof input?.email==="string"?input.email:"")).trim().toLowerCase(),phone=typeof input?.phone==="string"?input.phone.trim():"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||phone&&!/^\+?[0-9]{8,15}$/.test(phone))throw new HttpException("Isi email yang valid dan nomor WhatsApp yang benar jika ingin dicantumkan.",400);
  if(!uuid(input?.id)||typeof input.code!=="string"||!/^managed\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.code)||!Number.isSafeInteger(input.expectedAmount)||Number(input.expectedAmount)<0||Number(input.expectedAmount)>100000000||typeof input.expectedRuleAt!=="string"||!Number.isFinite(Date.parse(input.expectedRuleAt)))throw new HttpException("Paket aplikasi tidak valid.",400);
  const voucher=input.voucher===undefined?null:parseVoucher(input.voucher);
  if(voucher && user && !identity.emailVerified)throw new HttpException("Verifikasi email akun sebelum memakai voucher.",403);
  if(voucher && await this.store.rpc<boolean>("consume_payment_rate",{p_key:`voucher-ip:${paymentHash(req.ip || req.socket?.remoteAddress || "unknown")}`,p_limit:15,p_seconds:60})!==true)
    throw new HttpException("Terlalu banyak percobaan voucher. Coba lagi nanti.",429);
  if(await this.store.rpc<boolean>("consume_payment_rate",{p_key:`premium:${user??identity.guestHash}`,p_limit:10,p_seconds:3600})!==true)throw new HttpException("Terlalu banyak pesanan. Coba lagi nanti.",429);
  const catalog=await this.catalog.list("apps");
  const product=catalog.items.find(row=>row.code===input.code);
  if(!product || (!voucher && product.price!==input.expectedAmount) || product.fulfillmentMode!=="manual")throw new HttpException("Paket atau harga berubah. Muat ulang katalog.",409);
  const amount=Number(input.expectedAmount);
  const [qris]=amount>0?await adminDb<{payload:string}>("premium_qris_settings","?id=eq.1&select=payload"):[];
  if(amount>0 && !qris)throw new HttpException("QRIS statis merchant belum diatur admin.",503);
  const args={p_id:input.id,p_user:user,p_guest_hash:user?null:identity.guestHash,p_email:email,p_phone:phone||null,p_product:input.code.slice(8),p_rule_updated_at:input.expectedRuleAt};
  const [order]=voucher
    ? await this.store.rpc<Record<string,unknown>[]>("reserve_premium_voucher",{...args,p_voucher:voucher,p_base_amount:product.price,p_expected_amount:amount,
        p_catalog_revision:catalog.catalogRevision ?? null,p_promoted:promotedProduct(product)})
    : await adminDb("rpc/reserve_premium_order","","POST",{...args,p_amount:product.price});
  if(!order)throw new HttpException("Pesanan belum dapat disiapkan. Periksa status sebelum mencoba lagi.",503);
  if(order.status!=="awaiting_qr")return {order};
  const dynamicPayload=qrisForAmount(qris!.payload,Number(order.amount));
  const image=await QRCode.toDataURL(dynamicPayload,{errorCorrectionLevel:"M",margin:2,width:480});
  const [prepared]=await adminDb("rpc/prepare_premium_order","","POST",{p_order:input.id,p_user:user,p_guest_hash:user?null:identity.guestHash,p_qr_image:image});
  if(!prepared)throw new HttpException("QRIS pesanan belum dapat disiapkan. Periksa status sebelum mencoba lagi.",503);
  return {order:prepared};
 }
 @Get() async list(@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res),ownership=identity.userId?`user_id=eq.${identity.userId}`:`guest_session_hash=eq.${identity.guestHash}`;
  const rows=await adminDb("premium_orders",`?${ownership}&payment_mode=eq.live&select=id,product_name,amount,status,created_at&order=created_at.desc&limit=100`);
  return {rows};
 }
 @Get("invoice/:invoice") async byInvoice(@Param("invoice") invoice:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res); if(!/^ANRS-[A-Z0-9-]{6,60}$/.test(invoice))throw new HttpException("Invoice tidak ditemukan.",404);
  const [canonical]=await adminDb<{id:string}> ("invoices",`?invoice_number=eq.${encodeURIComponent(invoice)}&order_kind=eq.premium&payment_mode=eq.live&select=id&limit=1`);
  if(!canonical)throw new HttpException("Invoice tidak ditemukan.",404);
  const order=await this.order(canonical.id,identity);
  return {order};
 }
 @Get(":id") async detail(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res),order=await this.order(id,identity);
  const [claim]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&select=*`);
  const voucher=order.voucher_applied?await this.store.voucherReceipt("premium_id",id):null;
  const [invoice]=await adminDb<{id:string;payment_mode:string;payment_status:string;fulfillment_status:string;amount:number;product_slug:string|null}>("invoices",`?id=eq.${id}&order_kind=eq.premium&select=id,payment_mode,payment_status,fulfillment_status,amount,product_slug&limit=1`);
  const [review]=invoice?await adminDb<{id:string;status:string}>("product_reviews",`?invoice_id=eq.${id}&select=id,status&limit=1`):[];
  const reviewEligible=!!invoice&&invoice.payment_mode==="live"&&invoice.payment_status==="paid"&&invoice.fulfillment_status==="completed"&&Number(invoice.amount)>0&&!!invoice.product_slug;
  return {order:{...order,voucher,review:{eligible:reviewEligible,submitted:!!review,status:review?.status??null}},claim:claim??null};
 }
 @Post(":id/proof") async proof(@Param("id") id:string,@Body() input:{image?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res,true),order=await this.order(id,identity),ownership=identity.userId?`user_id=eq.${identity.userId}`:`guest_session_hash=eq.${identity.guestHash}`;
  if(order.status!=="awaiting_payment" || typeof order.qr_expires_at!=="string" || Date.parse(order.qr_expires_at)<=Date.now())throw new HttpException("QRIS belum tersedia atau sudah kedaluwarsa.",409);
  const image=premiumImage(input?.image,10*1024*1024),note=typeof input?.note==="string"?input.note.trim():"";
  if(note.length>500)throw new HttpException("Catatan terlalu panjang.",400);
  const [saved]=await adminDb("premium_orders",`?id=eq.${id}&${ownership}&payment_mode=eq.live&status=eq.awaiting_payment&qr_expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,"PATCH",{proof_image:image,proof_note:note,status:"proof_submitted",updated_at:new Date().toISOString()});
  if(!saved)throw new HttpException("Status pesanan berubah. Muat ulang.",409);
  return {order:saved};
 }
 @Post(":id/code-request") async codeRequest(@Param("id") id:string,@Body() input:{note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res,true),order=await this.order(id,identity);
  if(!["paid","delivered"].includes(String(order.status))||typeof order.conversation_id!=="string")throw new HttpException("Chat pesanan tersedia setelah pembayaran terverifikasi.",409);
  const note=typeof input?.note==="string"?input.note.trim():"Mohon jadwalkan kode verifikasi.";
  const [room]=await adminDb("support_conversations",`?id=eq.${order.conversation_id}&select=id,status`);
  if(!room)throw new HttpException("Chat pesanan tidak ditemukan.",409);
  if(!identity.userId)throw new HttpException("Masuk ke akun untuk meminta kode melalui chat CS.",401);
  const message=messageInput({id:crypto.randomUUID(),body:`Permintaan jadwal kode verifikasi: ${note.slice(0,500)}`});
  await adminDb("rpc/append_support_message","","POST",{p_id:message.id,p_room:order.conversation_id,p_actor:identity.userId,p_role:"customer",p_body:message.body});
  return {requested:true};
 }
 @Post(":id/claim") async claim(@Param("id") id:string,@Body() input:{id?:unknown;reason?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.owner(req,res,true),order=await this.order(id,identity);
  if(!uuid(input?.id)||typeof input.reason!=="string"||input.reason.trim().length<10||input.reason.length>2000)throw new HttpException("Alasan klaim tidak valid.",400);
  if(order.status!=="delivered"||typeof order.delivered_at!=="string"||Date.now()>Date.parse(order.delivered_at)+Number(order.guarantee_days)*86400000)throw new HttpException("Masa garansi sudah berakhir atau pesanan belum dikirim.",409);
  const [existing]=await adminDb("premium_guarantee_claims",`?order_id=eq.${id}&select=id`);
  if(existing)throw new HttpException("Klaim garansi untuk pesanan ini sudah ada.",409);
  const [claim]=await adminDb("premium_guarantee_claims","","POST",{id:input.id,order_id:id,reason:input.reason.trim()});
  return {claim};
 }
}
