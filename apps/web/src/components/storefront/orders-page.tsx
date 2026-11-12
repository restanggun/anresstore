"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList, PackageCheck, Search } from "lucide-react";
import { loadOrder, loadOrders, statusLabels, statusSteps, type Order, type OrderItem } from "@/lib/orders";
import "./orders.css";

const money=(value:number)=>`Rp${value.toLocaleString("id-ID")}`;
const date=(value:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeStyle:"short"}).format(new Date(value));
const total=(order:Order)=>order.items.reduce((sum,item)=>sum+item.price*item.quantity,0);

function Progress({item}:{item:OrderItem}) {
 const steps=statusSteps(item.category);
 const index=steps.indexOf(item.status);
 if(item.status === "cancelled" || index === -1) return <p className="orders-status">{statusLabels[item.status] || "Status belum tersedia"}</p>;
 return <ol className="orders-progress" aria-label={`Tahap pesanan ${item.product}`}>{steps.map((step,i)=>{
  const optional=step === "revision";
  const done=i<index && !optional;
  return <li key={step} className={i===index ? "current" : done ? "done" : ""} aria-current={i===index ? "step" : undefined}><span>{done ? "✓" : i+1}</span><div><strong>{statusLabels[step]}</strong>{optional && <small>Jika diperlukan</small>}</div></li>;
 })}</ol>;
}
export function OrdersPage({orderId}:{orderId?:string}) {
 const router=useRouter(); const [query,setQuery]=useState("");
 const [orders,setOrders]=useState<Order[]>([]),[guest,setGuest]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{ let active=true; setLoading(true); setError(""); const request=orderId ? loadOrder(orderId).then(result=>({orders:result.order ? [result.order] : [],userId:result.userId})) : loadOrders(); request.then(result=>{if(active){setOrders(result.orders);setGuest(!result.userId);}}).catch(()=>{if(active)setError("Invoice tidak dapat dimuat. Coba muat ulang halaman.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[orderId]);
 const selected=orders.find(order=>order.id===orderId);
 const filtered=orders.filter(order=>order.id.toLowerCase().includes(query.trim().toLowerCase()));
 return <main id="main" className="container orders-page">
  <header className="orders-header"><div><span className="orders-icon"><ClipboardList size={25} aria-hidden="true"/></span><div><h1>{orderId ? "Detail invoice" : "Invoice"}</h1><p>Riwayat, status, dan detail pesananmu dalam satu tempat.</p></div></div>{orderId && <Link className="orders-back" href="/invoice"><ArrowLeft size={16}/> Semua invoice</Link>}</header>
  <div className="orders-notice"><strong>Pesanan simulasi</strong><span>Harga dan pembayaran masih contoh. Tidak ada transaksi atau pembayaran yang diproses.</span></div>
  {loading ? <p role="status">Memuat pesanan...</p> : error ? <p role="alert">{error}</p> : <>
   {guest && <p className="orders-guest">Riwayat tamu tersimpan hanya di browser ini dan terpisah dari riwayat akun.</p>}
   {!orderId && <form className="orders-search" role="search" onSubmit={event=>{event.preventDefault(); const id=query.trim(); if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) router.push(`/invoice/${id}`);}}><Search size={19} aria-hidden="true"/><label className="sr-only" htmlFor="invoice-search">Cari nomor invoice</label><input id="invoice-search" type="search" placeholder="Cari nomor invoice..." value={query} onChange={event=>setQuery(event.target.value)}/><button type="submit">Cari</button></form>}
   {orderId ? !selected ? <div className="orders-empty"><h2>Invoice tidak ditemukan</h2><p>Periksa kembali nomor invoice atau buka riwayat pesanan.</p><Link href="/invoice">Lihat semua invoice <ArrowRight size={16}/></Link></div> : <div className="orders-detail">
    <div className="orders-detail-head"><div><span>Nomor invoice</span><strong>{selected.id}</strong><p>{date(selected.created_at)}</p></div><div><span>Metode simulasi</span><strong>{selected.payment_method}</strong></div><div><span>Total estimasi</span><strong>{money(total(selected))}</strong></div></div>
    {selected.items.map((item,index)=><section className="orders-item" key={item.id+index}><div className="orders-item-heading"><span className="orders-item-icon"><PackageCheck size={22} aria-hidden="true"/></span><div><span>{item.category}</span><h2>{item.product}</h2></div><strong>{money(item.price*item.quantity)}</strong></div>
     <div className="orders-item-grid"><div><h3>Informasi produk</h3><dl><div><dt>Pilihan</dt><dd>{item.details}</dd></div><div><dt>Tujuan / detail</dt><dd>{item.target}</dd></div><div><dt>Kontak</dt><dd>{item.contact}</dd></div><div><dt>Jumlah</dt><dd>{item.quantity}</dd></div><div><dt>Harga satuan estimasi</dt><dd>{money(item.price)}</dd></div></dl></div><div><h3>Status pesanan</h3><Progress item={item}/><p className="orders-simulation-note">Status ini hanya contoh. Pemrosesan pesanan belum terhubung.</p></div></div>
    </section>)}
   </div> : !orders.length && !query.trim() ? <div className="orders-empty"><span className="orders-empty-icon"><ClipboardList size={27} aria-hidden="true"/></span><h2>Belum ada invoice</h2><p>Pesanan simulasimu akan muncul di sini setelah dibuat.</p><Link href="/katalog">Jelajahi katalog <ArrowRight size={16}/></Link></div> : !filtered.length ? <div className="orders-empty"><h2>Invoice tidak ditemukan</h2><p>Periksa nomor invoice. Untuk mencari di luar daftar terbaru, masukkan nomor lengkap dan tekan Cari.</p></div> : <div className="orders-list">{filtered.map(order=><Link className="orders-card" key={order.id} href={`/invoice/${order.id}`}><div><span>{date(order.created_at)}</span><h2>{order.items.map(item=>item.product).join(", ")}</h2><p>{order.items.length} produk · {order.payment_method} · Simulasi</p><small>{order.id}</small></div><div><strong>{money(total(order))}</strong><span>Lihat detail <ArrowRight size={16}/></span></div></Link>)}</div>}
  </>}
 </main>;
}
