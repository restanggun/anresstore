"use client";
import {useEffect,useState,type FormEvent} from "react";
import {Button} from "@anres/ui";
import {Mail,ShieldCheck} from "lucide-react";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {paymentRequest,PaymentRequestError} from "@/lib/payment-api";
import {invoicePath} from "@/lib/payment-navigation";
import Link from "./domain-link";
import "./invoice-recovery.css";

export function InvoiceRecovery({invoiceNumber,label="Pulihkan lewat email"}:{invoiceNumber?:string;label?:string}) {
 const [open,setOpen]=useState(false),[invoice,setInvoice]=useState(invoiceNumber||""),[code,setCode]=useState("");
 const [challenge,setChallenge]=useState<string|null>(null),[saved,setSaved]=useState<string|null>(null),[cooldown,setCooldown]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[needsLogin,setNeedsLogin]=useState(false);
 useEffect(()=>{if(!open||cooldown<=0)return;const timer=setTimeout(()=>setCooldown(value=>value-1),1000);return()=>clearTimeout(timer);},[open,cooldown]);
 async function request(event?:FormEvent) {
  event?.preventDefault();if(busy||cooldown>0)return;setBusy(true);setNotice("");setNeedsLogin(false);
  try {const result=await paymentRequest<{challengeId:string;message:string}>("recovery/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invoice:invoice.trim()})});setChallenge(result.challengeId);setNotice(result.message);setCooldown(60);setCode("");}
  catch(error){setNotice((error as Error).message);setNeedsLogin(error instanceof PaymentRequestError&&error.status===401);}finally{setBusy(false);}
 }
 async function verify(event:FormEvent){event.preventDefault();if(busy||!challenge)return;setBusy(true);setNotice("");try{const result=await paymentRequest<{invoiceNumber:string}>("recovery/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challengeId:challenge,code})});setSaved(result.invoiceNumber);window.dispatchEvent(new CustomEvent("invoice-ownership-updated",{detail:{invoiceNumber:result.invoiceNumber}}));}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
 return <><Button type="button" variant="outline" className="invoice-recovery-trigger" onClick={()=>{setOpen(true);setInvoice(invoiceNumber||"");setSaved(null);setChallenge(null);setNotice("");setNeedsLogin(false);setCode("");}}><Mail size={15} aria-hidden="true"/>{label}</Button>
  <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="invoice-recovery-dialog"><DialogTitle>{saved?"Invoice tersimpan di akunmu":"Simpan invoice ke akun"}</DialogTitle><DialogDescription>{saved?"Invoice dapat dibuka lagi dari akunmu, termasuk di perangkat lain.":"Masuk dengan email yang dipakai saat checkout. Kode verifikasi dikirim ke email akun tersebut; nomor invoice saja tidak memberi akses."}</DialogDescription>
   {saved?<div className="invoice-recovery-success"><ShieldCheck size={30} aria-hidden="true"/><strong>{saved}</strong><Button asChild><Link href={invoicePath(saved)}>Buka invoice</Link></Button></div>:<form className="invoice-recovery-form" onSubmit={event=>void(challenge?verify(event):request(event))}><label htmlFor="recovery-invoice">Nomor invoice<Input id="recovery-invoice" required maxLength={80} autoComplete="off" autoCapitalize="characters" value={invoice} onChange={event=>setInvoice(event.target.value)} disabled={busy||!!challenge} placeholder="ARNS-..."/></label>{challenge&&<label htmlFor="recovery-code">Kode email<Input id="recovery-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/[^0-9]/g,""))} disabled={busy}/><small>Kode berlaku 10 menit dan hanya dapat digunakan sekali.</small></label>}{notice&&<p role="status" className="invoice-recovery-notice">{notice}</p>}{needsLogin&&<Link className="shop-text-button" href="/login">Masuk dengan email checkout</Link>}<Button type="submit" disabled={busy||!invoice.trim()||!!challenge&&code.length!==6||!challenge&&cooldown>0}>{busy?"Memeriksa...":challenge?"Verifikasi dan simpan":"Kirim kode email"}</Button>{challenge&&<div className="invoice-recovery-secondary"><button type="button" disabled={busy||cooldown>0} onClick={()=>void request()}>{cooldown>0?`Kirim ulang dalam ${cooldown} detik`:"Kirim ulang kode"}</button><button type="button" disabled={busy} onClick={()=>{setChallenge(null);setCode("");setNotice("");}}>Ubah nomor invoice</button></div>}</form>}
  </DialogContent></Dialog>
 </>;
}
