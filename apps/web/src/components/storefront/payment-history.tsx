"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, Clock3, ReceiptText, RefreshCw, Download, TriangleAlert } from "lucide-react";
import { Button } from "@anres/ui";
import Link from "./domain-link";
import { InvoiceRecovery } from "./invoice-recovery";
import { downloadInvoiceCsv } from "@/lib/invoice-files";
import { orderStatus } from "@/lib/order-status";
import { invoicePath } from "@/lib/payment-navigation";
import { paymentRequest } from "@/lib/payment-api";
import { apiUrl } from "@/lib/auth-api";
import type { PaymentRecord } from "./payment-checkout";
import "./payment-history.css";

type PremiumHistory={id:string;product_name:string;amount:number;status:string;created_at:string};
type History = {payments:PaymentRecord[];hasMore:boolean;userId:string|null;attachedCount?:number;premium?:PremiumHistory[]};
const money = (value:number) => `Rp${value.toLocaleString("id-ID")}`;
const date = (value:string) => new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"}).format(new Date(value));

export function PaymentHistory({accountUserId,browserOnly=false}:{accountUserId?:string;browserOnly?:boolean}={}) {
 const [page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[data,setData]=useState<History|null>(null),[error,setError]=useState("");
 const [exporting,setExporting]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{const update=(event:Event)=>{const invoice=(event as CustomEvent<{invoiceNumber?:string;attachedCount?:number}>).detail?.invoiceNumber;const count=(event as CustomEvent<{attachedCount?:number}>).detail?.attachedCount;if(count&&!browserOnly)setNotice(`${count} invoice guest tersimpan di akunmu.`);if(invoice&&!browserOnly)setNotice(`Invoice ${invoice} tersimpan di akunmu.`);setRefresh(value=>value+1);};window.addEventListener("invoice-ownership-updated",update);return()=>window.removeEventListener("invoice-ownership-updated",update);},[browserOnly]);
 async function exportCsv(){if(exporting)return;setExporting(true);setNotice("");try{await downloadInvoiceCsv();setNotice("Riwayat akun berhasil diekspor ke CSV.");}catch(error){setNotice((error as Error).message);}finally{setExporting(false);}}
 useEffect(()=>{
  const abort=new AbortController();setData(null);setError("");
  void paymentRequest<History>(`transactions?page=${page}${browserOnly?"&scope=guest":accountUserId?"&scope=account":""}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])}).then(async value=>{
   if(abort.signal.aborted)return;
   if(accountUserId && value.userId!==accountUserId)throw new Error("Sesi akun berubah. Muat ulang halaman untuk melihat riwayat akunmu.");
   if(!browserOnly){try{const response=await fetch(`${apiUrl}/premium-orders`,{credentials:"include",cache:"no-store",signal:abort.signal});if(response.ok){const result=await response.json();value.premium=result.rows||[]}}catch{}}
   setData(value);
  }).catch(error=>{if(!abort.signal.aborted)setError(error.message);});
  return()=>abort.abort();
 },[page,refresh,accountUserId,browserOnly]);
 if(browserOnly&&data&&!data.payments.length)return null;
 return <><section className="invoice-history" aria-label={browserOnly?"Invoice dari browser ini":accountUserId?"Riwayat transaksi saya":"Daftar invoice"}>
  <div className="invoice-history-heading"><div><h2>{browserOnly?"Invoice dari browser ini":accountUserId?"Riwayat transaksi":"Daftar invoice"}</h2><p>{browserOnly?"Invoice guest yang belum tersimpan ke akunmu.":accountUserId?"Pesanan dari akunmu, mulai dari yang terbaru.":"Invoice dari akun atau browser ini, mulai dari yang terbaru."}</p></div><div className="invoice-history-toolbar">{data?.userId&&!browserOnly&&<Button variant="outline" className="invoice-history-refresh" disabled={exporting} onClick={()=>void exportCsv()}><Download size={15} aria-hidden="true"/>{exporting?"Mengekspor...":"Ekspor CSV"}</Button>}<Button variant="outline" className="invoice-history-refresh" type="button" disabled={!data&&!error} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Muat ulang</Button></div></div>
  {notice&&<p className="invoice-csv-notice" role="status">{notice}</p>}
  {!!data?.attachedCount&&<p className="invoice-guest-notice" role="status">{data.attachedCount} invoice guest berhasil disimpan ke akunmu.</p>}
  {data&&!data.userId&&!browserOnly&&<div className="invoice-guest-notice"><span>Invoice guest mengikuti browser ini. Simpan ke akun agar bisa dibuka dari perangkat lain.</span><Link href="/login">Masuk untuk menyimpan</Link></div>}
  {error?<div className="invoice-history-error" role="alert"><TriangleAlert size={24} aria-hidden="true"/><div><h3>Daftar invoice belum dapat dimuat</h3><p>{error}</p><Button variant="outline" type="button" onClick={()=>setRefresh(value=>value+1)}>Coba lagi</Button></div></div>:!data?<div className="invoice-history-loading"><p role="status">Memuat daftar invoice...</p><div aria-hidden="true">{[0,1,2].map(index=><div className="invoice-entry-skeleton" key={index}><span/><div><i/><i/></div><b/></div>)}</div></div>:<>
   {!data.payments.length&&!data.premium?.length?<div className="invoice-history-empty"><span className="invoice-history-empty-icon" aria-hidden="true"><ReceiptText size={30}/></span><h3>{page?"Tidak ada invoice di halaman ini":"Belum ada invoice"}</h3><p>{page?"Kembali ke halaman sebelumnya untuk melihat pesanan lain.":accountUserId?"Invoice akan tampil di sini setelah kamu membuat pesanan dari akun ini.":"Setelah checkout, invoice pesananmu akan tersimpan di sini. Sudah punya nomornya? Gunakan pencarian di atas."}</p>{!page&&<Button asChild variant="outline"><Link href="/katalog">Jelajahi katalog<ArrowRight size={16} aria-hidden="true"/></Link></Button>}</div>:<div className="invoice-history-list">{data.payments.map(item=>{
    const status=orderStatus(item);
    const StatusIcon=status.tone==="review"?TriangleAlert:status.tone==="paid"?CircleCheck:Clock3;
    return <div className="invoice-entry-frame" key={item.id}><Link className="invoice-entry" href={invoicePath(item.id,item.invoiceNumber)}>
     <span className="invoice-entry-icon" aria-hidden="true"><ReceiptText size={23}/></span>
     <div className="invoice-entry-main"><span className="invoice-entry-number">{item.invoiceNumber||"Nomor invoice sedang disiapkan"}</span><h3>{item.product}</h3><div className="invoice-entry-meta"><time dateTime={item.createdAt}>{date(item.createdAt)} WIB</time><span>{item.method}</span></div></div>
     <div className="invoice-entry-state"><span className="invoice-entry-status" data-tone={status.tone}><StatusIcon size={14} aria-hidden="true"/>{status.title}</span>{item.status==="paid"&&<span className="invoice-entry-payment">Pembayaran {status.paymentLabel.toLowerCase()}</span>}</div>
     <div className="invoice-entry-amount"><span>{item.reference?"Total pembayaran":"Harga produk"}</span><strong>{item.reference?money(item.total):money(item.amount)}</strong>{!item.reference&&<small>Biaya admin belum tersedia</small>}</div>
     <span className="invoice-entry-arrow" aria-hidden="true"><ChevronRight size={19}/></span>
    </Link>{(browserOnly||item.ownership==="guest")&&<div className="invoice-entry-save"><span>Belum tersimpan ke akun</span>{data.userId?<InvoiceRecovery invoiceNumber={item.invoiceNumber||item.id} label="Simpan ke akun"/>:<Link href="/login">Masuk untuk menyimpan</Link>}</div>}</div>;
   })}{data.premium?.map(item=><div className="invoice-entry-frame" key={`premium-${item.id}`}><Link className="invoice-entry" href={invoicePath(item.id,item.invoice_number)}><span className="invoice-entry-icon" aria-hidden="true"><ReceiptText size={23}/></span><div className="invoice-entry-main"><span className="invoice-entry-number">Invoice aplikasi premium</span><h3>{item.product_name}</h3><div className="invoice-entry-meta"><time dateTime={item.created_at}>{date(item.created_at)} WIB</time><span>QRIS</span></div></div><div className="invoice-entry-state"><span className="invoice-entry-status" data-tone={item.status==="delivered"?"paid":"review"}><Clock3 size={14}/>{item.status}</span></div><div className="invoice-entry-amount"><span>Total pesanan</span><strong>{money(Number(item.amount))}</strong></div><span className="invoice-entry-arrow" aria-hidden="true"><ChevronRight size={19}/></span></Link></div>)}</div>}
   {(page>0||data.hasMore)&&<nav className="invoice-history-pagination" aria-label="Halaman daftar invoice"><Button variant="outline" type="button" disabled={!page} onClick={()=>setPage(page-1)}><ChevronLeft size={16} aria-hidden="true"/>Sebelumnya</Button><span aria-live="polite">Halaman {page+1}</span><Button variant="outline" type="button" disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Berikutnya<ChevronRight size={16} aria-hidden="true"/></Button></nav>}
  </>}
 </section>{data?.userId&&!browserOnly&&<PaymentHistory browserOnly/>}</>;
}
