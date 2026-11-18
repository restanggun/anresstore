"use client";
import { PaymentMethods } from "./payment-methods";
import { CheckoutVoucher, voucherScope, type AppliedVoucher } from "./checkout-voucher";
import type { PaymentChannel } from "@/lib/payment-channels";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/auth-api";
import { useCheckoutEmail } from "./use-checkout-email";

type Rule={access_type:string;duration_days:number;guarantee_days:number;guarantee_terms:string;updated_at:string};
type CheckoutContact = { email: string; phone: string; emailLoading: boolean };
const qrisChannels: PaymentChannel[] = [{
  code: "QRIS", name: "QRIS", group: "QRIS", iconUrl: null,
  minimum: 0, maximum: Infinity, fee: { flat: 0, percent: 0 },
}];
export function PremiumCheckout({code,amount,onCreated,checkoutContact}:{code:string;amount:number;onCreated?:()=>void|Promise<void>;checkoutContact?:CheckoutContact}){
 const router=useRouter(),{accountEmail,loading}=useCheckoutEmail();
 const [rule,setRule]=useState<Rule|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[email,setEmail]=useState(""),[phone,setPhone]=useState("");
 useEffect(()=>{const controller=new AbortController();setRule(null);setError("");void fetch(`${apiUrl}/premium-orders/product/${code.slice(8)}`,{credentials:"include",cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(typeof data.message==="string"?data.message:"Ketentuan paket belum tersedia.");if(!controller.signal.aborted)setRule(data)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Ketentuan paket belum tersedia.")});return()=>controller.abort()},[code]);
 const customerEmail=checkoutContact?.email??(accountEmail||email);
 const checkoutPhone=checkoutContact?.phone??phone;
 const emailIsLoading=checkoutContact?.emailLoading??loading;
 const emailIsReadOnly = !!accountEmail;
 const [voucher,setVoucher]=useState<AppliedVoucher|null>(null);
 const [checkingVoucher,setCheckingVoucher]=useState<string|null>(null);
 const voucherProduct={source:"apps",code,amount};
 const scope=voucherScope(voucherProduct);
 const applied=voucher?.scope===scope?voucher:null;
 const payableAmount=applied?.amount??amount;
 const gift=applied?.kind==="gift";
 const submitting=useRef(false);
 async function create(){
  if(!rule||submitting.current||checkingVoucher===scope||!customerEmail.trim())return;
  submitting.current=true;setBusy(true);setError("");
  try {
   const key=`anres-premium-intent:${customerEmail.toLowerCase()}:${code}`;
   const saved=localStorage.getItem(key);
   let id=saved&&/^[a-f0-9-]{36}$/.test(saved)?saved:crypto.randomUUID();
   if(saved){
    const existing=await fetch(`${apiUrl}/premium-orders/${id}`,{credentials:"include",cache:"no-store"});
    if(existing.ok){
     const data=await existing.json();
     const status=data.order?.status;
     if(["closed","cancelled","delivered"].includes(status))id=crypto.randomUUID();
     else if(status!=="awaiting_qr"){await onCreated?.();router.push(`/premium-order/${id}`);return;}
    }else if(existing.status!==404)throw new Error("Status pesanan sebelumnya belum dapat diperiksa.");
   }
   localStorage.setItem(key,id);
   const response=await fetch(`${apiUrl}/premium-orders`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id,code,expectedAmount:payableAmount,expectedRuleAt:rule.updated_at,email:customerEmail.trim(),
     phone:checkoutPhone.trim(),...(applied?{voucher:applied.reference}:{})})});
   const data=await response.json();
   if(!response.ok)throw new Error(typeof data.message==="string"?data.message:"Pesanan belum dapat dibuat.");
   await onCreated?.();router.push(`/premium-order/${id}`);
  }catch(cause){setError(cause instanceof Error?cause.message:"Pesanan belum dapat dibuat.")}
  finally{submitting.current=false;setBusy(false);}
 }
 return (
  <form onSubmit={event => { event.preventDefault(); void create(); }}>
    <CheckoutVoucher key={scope} product={voucherProduct} applied={applied} disabled={busy}
      onChecking={(key,active)=>setCheckingVoucher(current=>active?key:current===key?null:current)}
      onApply={offer=>{setVoucher(offer);setError("");}}/>
    {gift ? <p role="status">Voucher menanggung harga produk. Total pembayaran Rp0.</p> : <PaymentMethods channels={qrisChannels} value="QRIS" disabled={busy}/>}
    {!checkoutContact && <>
      <label>
        {emailIsReadOnly ? "Email akun" : "Email untuk menerima data aplikasi"}
        <Input type="email" autoComplete="email" required maxLength={254}
          value={customerEmail} readOnly={emailIsReadOnly} disabled={emailIsLoading || busy}
          onChange={event => setEmail(event.target.value)} placeholder="nama@email.com"/>
      </label>
      <label>
        Nomor WhatsApp (Opsional)
        <Input type="tel" autoComplete="tel" maxLength={16} disabled={busy}
          value={checkoutPhone} onChange={event => setPhone(event.target.value)} placeholder="081234567890"/>
      </label>
    </>}
    {rule ? <>
      <dl className="order-summary-details">
        <div><dt>Jenis akses</dt><dd>{rule.access_type}</dd></div>
        <div><dt>Durasi</dt><dd>{rule.duration_days} hari</dd></div>
        <div><dt>Garansi</dt><dd>{rule.guarantee_days} hari</dd></div>
      </dl>
      <p>{rule.guarantee_terms}</p>
    </> : !error && <p role="status">Memuat ketentuan paket...</p>}
    {error && <p role="alert">{error}</p>}
    <Button type="submit" className="order-primary"
      disabled={!rule || busy || checkingVoucher===scope || emailIsLoading || !/^\S+@\S+\.\S+$/.test(customerEmail.trim()) ||
        (!!checkoutPhone.trim() && !/^\+?[0-9]{8,15}$/.test(checkoutPhone.trim()))}>
      {busy ? "Menyiapkan pesanan..." : gift ? "Klaim produk Rp0" : "Lanjut ke pembayaran"}
    </Button>
    {!gift && <p className="checkout-payment-note">
      Pindai QRIS di invoice, lalu unggah bukti pembayaran untuk diverifikasi admin.
    </p>}
  </form>
 );
}
