"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ReceiptText, Search, ShieldCheck } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { PaymentHistory } from "./payment-history";
import { invoicePath } from "@/lib/payment-navigation";
import { PaymentInvoicePage } from "./payment-checkout";
import "./orders.css";
import "./invoice-index.css";

export function OrdersPage({ orderId }: { orderId?: string }) {
 const router = useRouter();
 const [query, setQuery] = useState("");
 const [error, setError] = useState("");
 const input = useRef<HTMLInputElement>(null);
 function search(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const code = query.trim().toUpperCase();
  try {
   const href = invoicePath(code.startsWith("ARNS-") ? code : code.toLowerCase());
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
   <form className="invoice-lookup-form" role="search" aria-label="Cari invoice" onSubmit={search}>
    <label htmlFor="invoice-search">Nomor invoice</label>
    <div className="invoice-lookup-controls"><div className="invoice-lookup-input" data-invalid={!!error}><Search size={19} aria-hidden="true"/><Input ref={input} id="invoice-search" value={query} onChange={event=>{setQuery(event.target.value);setError("");}} placeholder="Masukkan nomor invoice ARNS" required maxLength={80} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "invoice-search-error" : "invoice-search-hint"}/></div><Button type="submit" className="invoice-lookup-submit">Cari invoice<ArrowRight size={17} aria-hidden="true"/></Button></div>
    {error && <p id="invoice-search-error" className="invoice-lookup-error" role="alert">{error}</p>}
    <p id="invoice-search-hint" className="invoice-lookup-hint"><ShieldCheck size={16} aria-hidden="true"/>Gunakan akun atau browser yang dipakai saat memesan.</p>
   </form>
  </section>
  <PaymentHistory/>
 </main>;
}
