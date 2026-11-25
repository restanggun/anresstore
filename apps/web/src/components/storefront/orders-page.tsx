"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ReceiptText, ShieldCheck } from "lucide-react";
import { Button, SearchField } from "@anres/ui";
import { InvoiceRecovery } from "./invoice-recovery";
import { PaymentHistory } from "./payment-history";
import { invoicePath } from "@/lib/payment-navigation";
import { PaymentInvoicePage } from "./payment-checkout";
import { PremiumOrderPage } from "./premium-order-page";
import { apiUrl } from "@/lib/auth-api";
import "./orders.css";
import "./invoice-index.css";

function InvoiceDetail({ id }: { id: string }) {
 const [premiumId, setPremiumId] = useState<string | null>();
 useEffect(() => {
  const controller = new AbortController();
  const code = encodeURIComponent(id);
  const path = id.startsWith("ANRS-") ? `invoice/${code}` : code;
  void fetch(`${apiUrl}/premium-orders/${path}`, {
   credentials: "include",
   cache: "no-store",
   signal: controller.signal,
  }).then(async response => {
   const data: { order?: { id: string } } | null = response.ok ? await response.json() : null;
   if (!controller.signal.aborted) setPremiumId(data?.order?.id ?? null);
  }).catch(() => {
   if (!controller.signal.aborted) setPremiumId(null);
  });
  return () => controller.abort();
 }, [id]);

 if (premiumId === undefined) return <main id="main" className="container invoice-index-page"><p>Memuat invoice…</p></main>;
 if (premiumId) return <PremiumOrderPage id={premiumId}/>;
 return <PaymentInvoicePage id={id}/>;
}

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
   if(code.startsWith("ANRS-")){router.push(`/invoice/${encodeURIComponent(code)}`);return;}
   const href = invoicePath(code.toLowerCase());
   setError("");
   router.push(href);
  } catch {
   setError("Nomor invoice belum lengkap. Salin kembali nomor dari pesananmu.");
   input.current?.focus();
  }
 }
 if (orderId) return /^[a-f0-9-]{36}$/i.test(orderId)||orderId.startsWith("ANRS-") ? <InvoiceDetail key={orderId} id={orderId}/> : <PaymentInvoicePage id={orderId}/>;
 return <main id="main" className="container invoice-index-page">
  <header className="invoice-index-heading"><h1>Invoice</h1><p>Temukan pesananmu dan ikuti setiap perkembangannya.</p></header>
  <section className="invoice-lookup" aria-labelledby="invoice-lookup-title">
   <div className="invoice-lookup-copy"><span className="invoice-lookup-icon" aria-hidden="true"><ReceiptText size={26}/></span><h2 id="invoice-lookup-title">Cari invoice pesanan</h2><p>Sudah punya nomor invoice? Buka rincian pembayaran dan status produkmu di sini.</p></div>
   <div><form className="invoice-lookup-form" role="search" aria-label="Cari invoice" onSubmit={search}>
    <label htmlFor="invoice-search">Nomor invoice</label>
    <div className="invoice-lookup-controls"><SearchField className="invoice-lookup-input" ref={input} id="invoice-search" value={query} onChange={event=>{setQuery(event.target.value);setError("");}} placeholder="Masukkan nomor invoice ARNS" required maxLength={80} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "invoice-search-error" : "invoice-search-hint"}/><Button type="submit" className="invoice-lookup-submit">Cari invoice<ArrowRight size={17} aria-hidden="true"/></Button></div>
    {error && <p id="invoice-search-error" className="invoice-lookup-error" role="alert">{error}</p>}
    <p id="invoice-search-hint" className="invoice-lookup-hint"><ShieldCheck size={16} aria-hidden="true"/>Gunakan akun atau browser yang dipakai saat memesan.</p>
   </form>
   <div className="invoice-lookup-recovery"><span>Invoice tidak muncul di perangkat ini?</span><InvoiceRecovery/></div></div>
  </section>
  {premium&&<section className="invoice-lookup"><h2>{premium.product_name}</h2><p>{premium.invoice_number} · Rp{Number(premium.amount).toLocaleString("id-ID")}</p><strong>{premium.status}</strong><p>Pesanan premium dipantau di halaman invoice ini; data akses dikirim setelah pembayaran diterima.</p></section>}{premiumError&&<p role="status">{premiumError}</p>}<PaymentHistory/>
 </main>;
}
