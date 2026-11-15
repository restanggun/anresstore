"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { PaymentHistory } from "./payment-history";
import { invoicePath } from "@/lib/payment-navigation";
import { PaymentInvoicePage } from "./payment-checkout";
import "./orders.css";
export function OrdersPage({ orderId }: { orderId?: string }) {
 const router = useRouter(); const [query,setQuery] = useState("");
 if(orderId) return <PaymentInvoicePage id={orderId}/>;
 return <main id="main" className="container orders-page">
  <header className="orders-header"><div><span className="orders-icon"><ClipboardList size={25}/></span><div><h1>Invoice</h1><p>Riwayat pembayaran, tujuan, dan status pesananmu.</p></div></div></header>
  <form className="orders-search" role="search" onSubmit={event=>{event.preventDefault();const code=query.trim().toUpperCase();try{router.push(invoicePath(code.startsWith("ARNS-")?code:code.toLowerCase()));}catch{event.currentTarget.querySelector("input")?.setCustomValidity("Masukkan nomor invoice ARNS yang lengkap.");event.currentTarget.reportValidity();}}}>
   <Search size={19} aria-hidden="true"/><label className="sr-only" htmlFor="invoice-search">Nomor invoice</label><input id="invoice-search" value={query} onChange={event=>{event.target.setCustomValidity("");setQuery(event.target.value);}} placeholder="Masukkan nomor invoice ARNS" required maxLength={80} autoCapitalize="characters" spellCheck={false}/><button type="submit">Cari invoice</button>
  </form><PaymentHistory/>
 </main>;
}
