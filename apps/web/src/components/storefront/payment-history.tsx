"use client";
import { useEffect, useState } from "react";
import Link from "@/components/storefront/domain-link";
import { orderStatus } from "@/lib/order-status";
import { invoicePath } from "@/lib/payment-navigation";
import { paymentRequest } from "@/lib/payment-api";
import type { PaymentRecord } from "./payment-checkout";

const labels: Record<string,string> = {pending:"Menunggu pembayaran",creating:"Membuat pembayaran",paid:"Lunas",failed:"Gagal",expired:"Kedaluwarsa",refunded:"Dikembalikan",unknown:"Perlu diperiksa"};
type History = {payments:PaymentRecord[];hasMore:boolean;userId:string|null};
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
  return <section className="payment-history" aria-label={accountUserId?"Riwayat transaksi saya":"Invoice pembayaran"}>
    <div className="payment-history-heading"><div><h2>{accountUserId?"Riwayat transaksi":"Invoice pembayaran"}</h2><p>{accountUserId?"Transaksi dan invoice yang tersimpan di akunmu, dari yang paling baru.":"Riwayat pembayaran dan pemrosesan pesanan. Riwayat tamu mengikuti sesi browser; riwayat akun hanya tampil untuk pemiliknya."}</p></div><button className="payment-history-button" type="button" disabled={!data&&!error} onClick={()=>setRefresh(value=>value+1)}>Muat ulang</button></div>
    {error?<div className="orders-empty"><p role="alert">{error}</p><button className="payment-history-button" type="button" onClick={()=>setRefresh(value=>value+1)}>Coba lagi</button></div>:!data?<p role="status">Memuat riwayat transaksi...</p>:<>
      {!data.payments.length?<div className="orders-empty"><h3>{page?"Tidak ada transaksi pada halaman ini":"Belum ada transaksi"}</h3><p>{accountUserId?"Transaksi yang dibuat saat masuk ke akun ini akan tampil di sini.":"Invoice akan tampil setelah kamu membuat transaksi."}</p><Link href="/katalog">Jelajahi katalog</Link></div>:<div className="orders-list">{data.payments.map(item=><Link className="orders-card" key={item.id} href={invoicePath(item.id, item.invoiceNumber)}><div><span>{new Date(item.createdAt).toLocaleString("id-ID")}</span><h3>{item.product}</h3><p className="order-status-label" data-tone={orderStatus(item).tone}>{orderStatus(item).title}</p><p>Pembayaran: {orderStatus(item).paymentLabel} / Pengiriman: {orderStatus(item).deliveryLabel}</p><p>Metode: {item.method}{item.target?` · Tujuan: ${item.target}`:""}</p><small>Invoice: {item.invoiceNumber || "Menyiapkan nomor invoice"}</small></div><div><strong>Rp{item.total.toLocaleString("id-ID")}</strong><span>Lihat detail invoice</span></div></Link>)}</div>}
      {(page>0||data.hasMore)&&<nav className="payment-history-pagination" aria-label="Halaman riwayat transaksi"><button className="payment-history-button" type="button" disabled={!page} onClick={()=>setPage(page-1)}>Sebelumnya</button><span>Halaman {page+1}</span><button className="payment-history-button" type="button" disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Berikutnya</button></nav>}
    </>}
  </section>;
}
