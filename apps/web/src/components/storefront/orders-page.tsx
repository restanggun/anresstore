"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { PaymentHistory } from "./payment-history";
import { SandboxPaymentPage } from "./payment-checkout";
import "./orders.css";
export function OrdersPage({ orderId }: { orderId?: string }) {
 const router = useRouter(); const [query,setQuery] = useState("");
 if(orderId) return <SandboxPaymentPage id={orderId}/>;
 return <main id="main" className="container orders-page">
  <header className="orders-header"><div><span className="orders-icon"><ClipboardList size={25}/></span><div><h1>Invoice</h1><p>Riwayat pembayaran, tujuan, dan status pesananmu.</p></div></div></header>
  <form className="orders-search" role="search" onSubmit={event=>{event.preventDefault();const id=query.trim().toLowerCase();if(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) router.push('/pembayaran/'+id);}}>
   <Search size={19} aria-hidden="true"/><label className="sr-only" htmlFor="invoice-search">Nomor invoice</label><input id="invoice-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Masukkan nomor invoice lengkap" required pattern="[a-fA-F0-9-]{36}"/><button type="submit">Cari</button>
  </form><PaymentHistory/>
 </main>;
}
