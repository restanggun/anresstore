const fs = require('node:fs');
function edit(path, change) { const before=fs.readFileSync(path,'utf8'); const after=change(before); if(before===after) throw new Error('No edit: '+path); fs.writeFileSync(path,after); }
edit('apps/web/src/components/storefront/cart-popup.tsx',s=>s
 .replace('useEffect, useRef, useState','useEffect, useState').replace('import { useRouter } from "next/navigation";\n','').replace('Button, CustomSelect','Button').replace('import { createOrder } from "@/lib/orders";\n','')
 .replace(/ const router=useRouter\(\); const pendingOrder=.*\r?\n/,'').replace(/ const \[payment, setPayment\].*\r?\n/,'').replace(/ const checkout = async.*\r?\n/,'')
 .replace(/     \{stage === 1 && !providerItems.length && <label.*\r?\n/,'').replace(/     \{stage === 1 && !providerItems.length && <p.*\r?\n/,'')
 .replace('disabled={!!editing || busy}','disabled={!!editing || busy || !providerItems.length}')
 .replace(/ : !providerItems.length \? <Button.*?<\/Button> : <section>/,' : <section>')
 .replace('Layanan manual tetap berada di keranjang; selesaikan produk digital terlebih dahulu.','Produk lama belum memiliki kode layanan. Pilih ulang dari katalog sebelum membayar.')
 .replace('     <div className="cart-total">','     {items.length > providerItems.length && <p role="alert">Ada produk lama yang perlu dipilih ulang melalui katalog agar harga dan layanan dapat diverifikasi.</p>}\n     <div className="cart-total">'));
edit('apps/web/src/components/storefront/catalog.tsx',s=>s
 .replace('import { createOrder } from "@/lib/orders";\n','').replace(/ const orderId = useRef.*\r?\n/,'')
 .replace('; const [payment, setPayment] = useState("QRIS")','')
 .replace(/ const saveOrder = async.*\r?\n/,'')
 .replace(/ : \(gameFlow \? step === 4 : step === 3\) && <div className="order-card"><h2><TextGenerateEffect as="span" words="Pilih pembayaran"[\s\S]*?<\/Button><\/div>\}<\/motion.div>/,' : (gameFlow ? step === 4 : step === 3) && <div className="order-card"><p role="alert">Produk tidak tersedia. Kembali dan pilih ulang produk dari katalog.</p></div>}</motion.div>'));
edit('apps/api/src/auth/auth.controller.ts',s=>{
 const start=s.indexOf(' @Post("orders")'); const end=s.indexOf(' @Post("profile")',start);
 if(start<0||end<0)throw new Error('legacy orders endpoint missing');
 return s.slice(0,start)+' @Post("orders") async createOrder(@Body() _body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) { this.validateOrigin(req); await this.authenticated(req,res); throw new HttpException("Checkout lama dinonaktifkan. Buat invoice melalui /v1/payments/transactions.",410); }\n'+s.slice(end);
});
edit('apps/api/test/payments.test.mjs',s=>s.replaceAll("'reserve_sandbox_payment'","'reserve_payment'"));
edit('apps/api/test/orders.test.mjs',s=>{
 const start=s.indexOf('  await assert.rejects(()=>controller.createOrder');const end=s.indexOf('\n } finally',start);
 return s.slice(0,start)+'  await assert.rejects(()=>controller.createOrder({id,userId:"user-123",paymentMethod:"QRIS",items:[item]},req,{}),error=>error.getStatus()===410);\n  assert.equal(calls.filter(call=>call.options.method==="POST").length,0);'+s.slice(end);
});
edit('apps/web/src/components/storefront/payment-history.tsx',s=>s.replace('paid:"Lunas (sandbox)"','paid:"Lunas"').replace('Transaksi Tripay sandbox. Riwayat tamu mengikuti sesi browser; riwayat akun hanya tampil untuk pemiliknya.','Riwayat pembayaran dan pemrosesan pesanan. Riwayat tamu mengikuti sesi browser; riwayat akun hanya tampil untuk pemiliknya.').replace('{labels[item.status] ?? item.status}','{labels[item.status] ?? item.status}{item.sandbox ? " · Mode uji" : ""}'));
fs.writeFileSync('apps/web/src/components/storefront/orders-page.tsx',`"use client";
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
`);
fs.writeFileSync('apps/web/src/lib/orders.ts','// Checkout and invoice history use /v1/payments. Legacy client-priced order writes are disabled.\nexport {};\n');
