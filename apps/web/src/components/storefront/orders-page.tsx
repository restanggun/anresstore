"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ReceiptText, Search, ShieldCheck } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { InvoiceRecovery } from "./invoice-recovery";
import { PaymentHistory } from "./payment-history";
import { invoicePath } from "@/lib/payment-navigation";
import { PaymentInvoicePage } from "./payment-checkout";
import { apiUrl } from "@/lib/auth-api";
import "./orders.css";
import "./invoice-index.css";

function PremiumInvoice({id}:{id:string}){const [order,setOrder]=useState<any>(null),[error,setError]=useState("");useEffect(()=>{void fetch(`${apiUrl}/premium-orders/${id}`,{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||"Invoice tidak ditemukan.");setOrder(d.order)}).catch(e=>setError(e.message))},[id]);return <main className="container invoice-index-page"><header className="invoice-index-heading"><h1>Invoice aplikasi premium</h1><p>Ikuti pembayaran dan pengiriman pesananmu.</p></header>{error&&<p role="alert">{error}</p>}{!order?<p role="status">Memuat invoice…</p>:<section className="invoice-lookup"><h2>{order.product_name}</h2><p>Rp{Number(order.amount).toLocaleString("id-ID")}</p><strong>{order.status}</strong><p>Data akses dikirim setelah pembayaran diverifikasi. Untuk pesanan lengkap, buka <a href={`/premium-order/${id}`}>detail pesanan</a>.</p></section>}</main>;}

export function OrdersPage({ orderId }: { orderId?: string }) {
 const router = useRouter();
 const [query, setQuery] = useState("");
 const [error, setError] = useState("");
 const input = useRef<HTMLInputElement>(null);
 const [premium,setPremium]=useState<{id:string;invoice_number:string;product_name:string;amount:number;status:string}|null>(null);
 const [premiumError,setPremiumError]=useState("");
 function search(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const code = query.trim().toUpperCase();
  try {
   if(/^[a-f0-9-]{36}$/i.test(code)){void fetch(`${apiUrl}/premium-orders/${encodeURIComponent(code)}`,{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(r.ok){setPremium(d.order);setPremiumError("")}else{setPremium(null);setPremiumError(d.message||"Invoice tidak ditemukan.")}});return;}
   const href = invoicePath(code.toLowerCase());
   setError("");
   router.push(href);
  } catch {
   setError("Nomor invoice belum lengkap. Salin kembali nomor dari pesananmu.");
   input.current?.focus();
  }
 }
 if (orderId) return <PaymentInvoicePage id={orderId}/>;
 return <main id="main" className="container invoice-index-page">
  <header className="invoice-index-heading"><h1>Invoice</h1><p>Temukan pesananmu dan ikuti setiap perkembangannya.</p></header>
  <section className="invoice-lookup" aria-labelledby="invoice-lookup-title">
   <div className="invoice-lookup-copy"><span className="invoice-lookup-icon" aria-hidden="true"><ReceiptText size={26}/></span><h2 id="invoice-lookup-title">Cari invoice pesanan</h2><p>Sudah punya nomor invoice? Buka rincian pembayaran dan status produkmu di sini.</p></div>
   <div><form className="invoice-lookup-form" role="search" aria-label="Cari invoice" onSubmit={search}>
    <label htmlFor="invoice-search">Nomor invoice</label>
    <div className="invoice-lookup-controls"><div className="invoice-lookup-input" data-invalid={!!error}><Search size={19} aria-hidden="true"/><Input ref={input} id="invoice-search" value={query} onChange={event=>{setQuery(event.target.value);setError("");}} placeholder="Masukkan nomor invoice ARNS" required maxLength={80} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "invoice-search-error" : "invoice-search-hint"}/></div><Button type="submit" className="invoice-lookup-submit">Cari invoice<ArrowRight size={17} aria-hidden="true"/></Button></div>
    {error && <p id="invoice-search-error" className="invoice-lookup-error" role="alert">{error}</p>}
    <p id="invoice-search-hint" className="invoice-lookup-hint"><ShieldCheck size={16} aria-hidden="true"/>Gunakan akun atau browser yang dipakai saat memesan.</p>
   </form>
   <div className="invoice-lookup-recovery"><span>Invoice tidak muncul di perangkat ini?</span><InvoiceRecovery/></div></div>
  </section>
  {premium&&<section className="invoice-lookup"><h2>{premium.product_name}</h2><p>{premium.invoice_number} · Rp{Number(premium.amount).toLocaleString("id-ID")}</p><strong>{premium.status}</strong><p>Pesanan premium dipantau di halaman invoice ini; data akses dikirim setelah pembayaran diterima.</p></section>}{premiumError&&<p role="status">{premiumError}</p>}<PaymentHistory/>
 </main>;
}
