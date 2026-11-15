"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, Clock3, ReceiptText, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@anres/ui";
import Link from "./domain-link";
import { orderStatus } from "@/lib/order-status";
import { invoicePath } from "@/lib/payment-navigation";
import { paymentRequest } from "@/lib/payment-api";
import type { PaymentRecord } from "./payment-checkout";
import "./payment-history.css";

type History = {payments:PaymentRecord[];hasMore:boolean;userId:string|null};
const money = (value:number) => `Rp${value.toLocaleString("id-ID")}`;
const date = (value:string) => new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"}).format(new Date(value));

export function PaymentHistory({accountUserId}:{accountUserId?:string}={}) {
 const [page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[data,setData]=useState<History|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  const abort=new AbortController();setData(null);setError("");
  void paymentRequest<History>(`transactions?page=${page}${accountUserId?"&scope=account":""}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])}).then(value=>{
   if(abort.signal.aborted)return;
   if(accountUserId && value.userId!==accountUserId)throw new Error("Sesi akun berubah. Muat ulang halaman untuk melihat riwayat akunmu.");
   setData(value);
  }).catch(error=>{if(!abort.signal.aborted)setError(error.message);});
  return()=>abort.abort();
 },[page,refresh,accountUserId]);
 return <section className="invoice-history" aria-label={accountUserId?"Riwayat transaksi saya":"Daftar invoice"}>
  <div className="invoice-history-heading"><div><h2>{accountUserId?"Riwayat transaksi":"Daftar invoice"}</h2><p>{accountUserId?"Pesanan dari akunmu, mulai dari yang terbaru.":"Invoice dari akun atau browser ini, mulai dari yang terbaru."}</p></div><Button variant="outline" className="invoice-history-refresh" type="button" disabled={!data&&!error} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Muat ulang</Button></div>
  {error?<div className="invoice-history-error" role="alert"><TriangleAlert size={24} aria-hidden="true"/><div><h3>Daftar invoice belum dapat dimuat</h3><p>{error}</p><Button variant="outline" type="button" onClick={()=>setRefresh(value=>value+1)}>Coba lagi</Button></div></div>:!data?<div className="invoice-history-loading"><p role="status">Memuat daftar invoice...</p><div aria-hidden="true">{[0,1,2].map(index=><div className="invoice-entry-skeleton" key={index}><span/><div><i/><i/></div><b/></div>)}</div></div>:<>
   {!data.payments.length?<div className="invoice-history-empty"><span className="invoice-history-empty-icon" aria-hidden="true"><ReceiptText size={30}/></span><h3>{page?"Tidak ada invoice di halaman ini":"Belum ada invoice"}</h3><p>{page?"Kembali ke halaman sebelumnya untuk melihat pesanan lain.":accountUserId?"Invoice akan tampil di sini setelah kamu membuat pesanan dari akun ini.":"Setelah checkout, invoice pesananmu akan tersimpan di sini. Sudah punya nomornya? Gunakan pencarian di atas."}</p>{!page&&<Button asChild variant="outline"><Link href="/katalog">Jelajahi katalog<ArrowRight size={16} aria-hidden="true"/></Link></Button>}</div>:<div className="invoice-history-list">{data.payments.map(item=>{
    const status=orderStatus(item);
    const StatusIcon=status.tone==="review"?TriangleAlert:status.tone==="paid"?CircleCheck:Clock3;
    return <Link className="invoice-entry" key={item.id} href={invoicePath(item.id,item.invoiceNumber)}>
     <span className="invoice-entry-icon" aria-hidden="true"><ReceiptText size={23}/></span>
     <div className="invoice-entry-main"><span className="invoice-entry-number">{item.invoiceNumber||"Nomor invoice sedang disiapkan"}</span><h3>{item.product}</h3><div className="invoice-entry-meta"><time dateTime={item.createdAt}>{date(item.createdAt)} WIB</time><span>{item.method}</span></div></div>
     <div className="invoice-entry-state"><span className="invoice-entry-status" data-tone={status.tone}><StatusIcon size={14} aria-hidden="true"/>{status.title}</span>{item.status==="paid"&&<span className="invoice-entry-payment">Pembayaran {status.paymentLabel.toLowerCase()}</span>}</div>
     <div className="invoice-entry-amount"><span>{item.reference?"Total pembayaran":"Harga produk"}</span><strong>{item.reference?money(item.total):money(item.amount)}</strong>{!item.reference&&<small>Biaya admin belum tersedia</small>}</div>
     <span className="invoice-entry-arrow" aria-hidden="true"><ChevronRight size={19}/></span>
    </Link>;
   })}</div>}
   {(page>0||data.hasMore)&&<nav className="invoice-history-pagination" aria-label="Halaman daftar invoice"><Button variant="outline" type="button" disabled={!page} onClick={()=>setPage(page-1)}><ChevronLeft size={16} aria-hidden="true"/>Sebelumnya</Button><span aria-live="polite">Halaman {page+1}</span><Button variant="outline" type="button" disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Berikutnya<ChevronRight size={16} aria-hidden="true"/></Button></nav>}
  </>}
 </section>;
}
