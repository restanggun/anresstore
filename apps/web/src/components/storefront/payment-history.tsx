"use client";
import { useEffect, useState } from "react";
import Link from "@/components/storefront/domain-link";
import { paymentRequest } from "@/lib/payment-api";
import type { SandboxPayment } from "./payment-checkout";

const labels: Record<string,string> = {pending:"Menunggu pembayaran",creating:"Membuat pembayaran",paid:"Lunas",failed:"Gagal",expired:"Kedaluwarsa",refunded:"Dikembalikan",unknown:"Perlu diperiksa"};
export function PaymentHistory() {
  const [page,setPage]=useState(0),[data,setData]=useState<{payments:SandboxPayment[];hasMore:boolean}|null>(null),[error,setError]=useState("");
  useEffect(()=>{const abort=new AbortController();setData(null);setError("");void paymentRequest<{payments:SandboxPayment[];hasMore:boolean}>(`transactions?page=${page}`,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setData(value);}).catch(error=>{if(!abort.signal.aborted)setError(error.message);});return()=>abort.abort();},[page]);
  return <section aria-label="Invoice pembayaran"><h2>Invoice pembayaran</h2><p>Riwayat pembayaran dan pemrosesan pesanan. Riwayat tamu mengikuti sesi browser; riwayat akun hanya tampil untuk pemiliknya.</p>{error ? <p role="alert">{error}</p> : !data ? <p role="status">Memuat pembayaran...</p> : <>{!data.payments.length ? <p>Belum ada pembayaran pada halaman ini.</p> : <div className="orders-list">{data.payments.map(item=><Link className="orders-card" key={item.id} href={`/pembayaran/${item.id}`}><div><span>{new Date(item.createdAt).toLocaleString("id-ID")}</span><h3>{item.product}</h3><p>{labels[item.status] ?? item.status}{item.sandbox ? " · Mode uji" : ""}</p><small>{item.id}</small></div><div><strong>Rp{item.total.toLocaleString("id-ID")}</strong><span>Lihat pembayaran dan pemrosesan</span></div></Link>)}</div>}<div><button disabled={!page} onClick={()=>setPage(page-1)}>Sebelumnya</button><span> Halaman {page+1} </span><button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Berikutnya</button></div></>}</section>;
}
