import { HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { boundedFetch } from "../common/bounded-fetch";
import { PaymentStore } from "./payment-store";
import { invoiceNumber, paymentId } from "./payment-contract";
import { tripayMode } from "./tripay-client";
import type { PaymentIdentity } from "./payment-identity";

export class InvoiceAccountService {
 constructor(private store = new PaymentStore()) {}
 private account(identity: PaymentIdentity) {
  if (!identity.userId) throw new HttpException("Masuk dengan email checkout untuk menyimpan atau memulihkan invoice.",401);
  if (!identity.emailVerified || !identity.email) throw new HttpException("Verifikasi email akun terlebih dahulu sebelum menyimpan invoice.",403);
  return {id:identity.userId,email:identity.email.trim().toLowerCase()};
 }
 async attach(identity: PaymentIdentity) {
  if (!identity.userId || !identity.guestHash || !identity.emailVerified || !identity.email) return 0;
  const count = await this.store.request<number>("rpc/attach_guest_invoices","POST",{p_user:identity.userId,p_guest_hash:identity.guestHash,p_email:identity.email,p_mode:tripayMode()});
  if (!Number.isSafeInteger(count) || count < 0) throw new HttpException("Invoice guest belum dapat disimpan. Coba muat ulang.",503);
  return count;
 }
 private async auth(path: string, body: unknown) {
  const url=process.env.SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpException("Pemulihan email belum dikonfigurasi.",503);
  try {
   const response=await boundedFetch(`${url}/auth/v1/${path}`,{method:"POST",redirect:"error",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json().catch(()=>null);
   if (!response.ok) throw new HttpException(path==="verify"?"Kode atau invoice tidak valid, sudah dipakai, atau kedaluwarsa.":"Kode belum dapat dikirim. Tunggu beberapa saat lalu coba lagi.",response.status===429?429:path==="verify"?400:503);
   return data as {user?:{id?:string;email?:string;email_confirmed_at?:string}};
  } catch(error) { if(error instanceof HttpException)throw error;throw new HttpException("Layanan email sementara tidak tersedia.",503); }
 }
 async request(identity: PaymentIdentity, invoice: unknown) {
  const account=this.account(identity);
  if(typeof invoice!=="string" || invoice.length>80 || (!invoiceNumber.test(invoice.trim().toUpperCase())&&!paymentId.test(invoice.trim().toLowerCase()))) throw new HttpException("Masukkan nomor invoice lengkap.",400);
  const id=randomUUID();
  await this.store.request("rpc/start_invoice_recovery","POST",{p_id:id,p_user:account.id,p_invoice:invoice.trim().toUpperCase(),p_email:account.email,p_mode:tripayMode()});
  // Send only to the verified account email, never an address provided in this request.
  // The database will grant access only if that email matches the original checkout.
  await this.auth("otp",{email:account.email,create_user:false});
  return {challengeId:id,message:"Kode dikirim ke email akunmu. Invoice hanya dapat disimpan jika email akun sama dengan email checkout.",expiresIn:600};
 }
 async verify(identity: PaymentIdentity, challengeId: unknown, code: unknown, onVerifiedSession?: (data:Record<string,any>)=>void) {
  const account=this.account(identity);
  if(typeof challengeId!=="string"||!paymentId.test(challengeId)||typeof code!=="string"||!/^\d{6}$/.test(code))throw new HttpException("Masukkan kode enam digit yang valid.",400);
  const allowed=await this.store.request<boolean>("rpc/consume_invoice_recovery_attempt","POST",{p_id:challengeId,p_user:account.id});
  if(allowed!==true)throw new HttpException("Kode atau invoice tidak valid, sudah dipakai, atau kedaluwarsa.",400);
  const proof=await this.auth("verify",{email:account.email,token:code,type:"email"});
  if(proof?.user?.id!==account.id||proof.user.email?.trim().toLowerCase()!==account.email||!proof.user.email_confirmed_at)throw new HttpException("Kode tidak cocok dengan akun yang sedang masuk.",400);
  onVerifiedSession?.(proof);
  const invoice=await this.store.request<string|null>("rpc/complete_invoice_recovery","POST",{p_id:challengeId,p_user:account.id,p_email:account.email});
  if(typeof invoice!=="string"||!invoiceNumber.test(invoice))throw new HttpException("Kode atau invoice tidak valid, sudah dipakai, atau kedaluwarsa.",400);
  return {invoiceNumber:invoice};
 }
}
