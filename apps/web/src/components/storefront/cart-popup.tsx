"use client";
import { publicOrderDetails } from "@/lib/catalog";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Minus, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { initCart, readCart, refreshGuestCart, writeCart, type CartItem } from "@/lib/cart";
import { PaymentCheckout } from "./payment-checkout";
import "./catalog-flow.css";
import "./catalog-system.css";
import "./cart.css";

const money = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export function CartPopup() {
 const [open, setOpen] = useState(false);
 const [items, setItems] = useState<CartItem[]>([]);
 const [stage, setStage] = useState(0);
 const [editing, setEditing] = useState<CartItem | null>(null);
 const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
 const [ready, setReady] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const reduce = useReducedMotion();
 useEffect(() => {
  const refresh = () => setItems(readCart());
  const show = () => { refresh(); setEditing(null); setStage(0); setOpen(true); };
  initCart().then(() => { refresh(); setReady(true); }).catch(() => setError("Keranjang tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi."));
  window.addEventListener("anres-cart-change", refresh);
  window.addEventListener("storage", refreshGuestCart);
  window.addEventListener("anres-cart-open", show);
  return () => { window.removeEventListener("anres-cart-change", refresh); window.removeEventListener("storage", refreshGuestCart); window.removeEventListener("anres-cart-open", show); };
 }, []);
 const update = async (next: CartItem[]) => { if (busy || !ready) return false; setBusy(true); setError(""); try { await writeCart(next); return true; } catch (err) { setError(err instanceof Error ? err.message : "Keranjang gagal disimpan. Coba lagi."); return false; } finally { setBusy(false); } };
 const providerItems = items.filter(item => ["Top up game","PPOB","Aplikasi premium","Booster media sosial","Joki tugas"].includes(item.category));
 const count = items.reduce((sum, item) => sum + item.quantity, 0);
 const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
 return <>
  <button className="cart-nav" aria-label={`Buka keranjang, ${count} produk`} onClick={() => { setEditing(null); setStage(0); setOpen(true); }}><ShoppingCart size={20} aria-hidden="true"/><span>{count}</span></button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="cart-dialog">
   <div className="cart-heading"><span className="cart-heading-icon"><ShoppingCart size={22} aria-hidden="true"/></span><div><DialogTitle>{stage === 0 ? "Keranjangmu" : "Checkout"}</DialogTitle><DialogDescription>{stage === 0 ? `${count} produk pilihanmu` : "Periksa kembali pesananmu."}</DialogDescription></div></div>
   <motion.div className="cart-body" key={stage} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce ? 0 : .25}}>
    {error && <p role="alert">{error}</p>}
    {!ready ? <p>{error ? "Keranjang belum tersedia." : "Memuat keranjang..."}</p> : items.length === 0 ? <div className="cart-empty"><ShoppingCart size={28} aria-hidden="true"/><strong>Keranjang masih kosong</strong><p>Pilih produk di katalog untuk mulai berbelanja.</p><Button onClick={() => setOpen(false)}>Lanjut belanja</Button></div> : <>
     <div className="cart-dialog-items"><AnimatePresence initial={false}>{[...items].reverse().map(item => <motion.div layout={!reduce} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,scale:.98}} key={item.id} className="cart-row">
      <div className="cart-item-head"><div><span className="cart-category">{item.category}</span><strong>{item.product}</strong></div><b>{money(item.price * item.quantity)}</b></div>
      <button type="button" className="cart-details-toggle" aria-expanded={expanded.has(item.id)} disabled={editing?.id === item.id} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{expanded.has(item.id) ? "Tutup detail" : "Lihat detail"}<ChevronDown size={16} aria-hidden="true" className={expanded.has(item.id) ? "is-expanded" : ""}/></button>
      {expanded.has(item.id) && (editing?.id === item.id && stage === 0 ? <form className="cart-edit" onSubmit={async e => { e.preventDefault(); if (!editing.target.trim() || !editing.contact.trim()) return; if (await update(items.map(x => x.id === editing.id ? {...x, target:editing.target.trim(), contact:editing.contact.trim()} : x))) setEditing(null); }}>
       <label>Tujuan / detail<Input value={editing.target} onChange={e => setEditing({...editing,target:e.target.value})} required /></label>
       <label>Nomor WhatsApp atau email<Input value={editing.contact} onChange={e => setEditing({...editing,contact:e.target.value})} required /></label>
       <div className="cart-edit-actions"><button type="button" onClick={() => setEditing(null)}>Batal</button><button type="submit" disabled={!editing.target.trim() || !editing.contact.trim()}>Simpan perubahan</button></div>
      </form> : <div className="cart-item-details"><small>Pilihan: {publicOrderDetails(item.details,item.category)}</small><small>Tujuan: {item.target}</small><small>Kontak: {item.contact}</small></div>)}
      {stage === 0 && <div className="cart-controls"><div className="cart-quantity"><button aria-label={`Kurangi ${item.product}`} disabled={item.quantity <= 1} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity - 1} : x))}><Minus size={15}/></button><span aria-label={`Jumlah ${item.quantity}`}>{item.quantity}</span><button aria-label={`Tambah ${item.product}`} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity + 1} : x))}><Plus size={15}/></button></div><button onClick={() => { setExpanded(current => new Set(current).add(item.id)); setEditing(item); }}><Pencil size={15}/>Edit</button><button onClick={() => { if (editing?.id === item.id) setEditing(null); update(items.filter(x => x.id !== item.id)); }}><Trash2 size={15}/>Hapus</button></div>}
     </motion.div>)}</AnimatePresence></div>
     {items.length > providerItems.length && <p role="alert">Ada produk lama yang perlu dipilih ulang melalui katalog agar harga dan layanan dapat diverifikasi.</p>}
     <div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div>
     {stage === 0 ? <Button className="order-primary" disabled={!!editing || busy || !providerItems.length} onClick={() => setStage(1)}>Lanjut checkout<ArrowRight size={17}/></Button> : <section><h3>Bayar per produk</h3><p>Setiap produk menggunakan satu invoice dan satu tujuan. Harga serta ketersediaan diverifikasi kembali oleh server. Selesaikan satu pembayaran sebelum melanjutkan produk berikutnya.</p>{providerItems.map(item => { const code=item.code || item.details.split(" · ").at(-1); const source=item.source || (item.category === "Top up game" ? "game" : item.category === "PPOB" ? "prepaid" : item.category === "Booster media sosial" ? "social" : item.category === "Joki tugas" ? "tasks" : "apps"); return <section key={item.id}><h4>{item.product}</h4>{code && /^[A-Za-z0-9._-]+$/.test(code) && (item.product !== "Mobile Legends" || item.targetZone) ? <PaymentCheckout source={source} code={code} serviceQuantity={item.serviceQuantity} target={item.target} targetZone={item.targetZone} amount={item.price} contact={item.contact} onCreated={async()=>{await writeCart(readCart().flatMap(row=>row.id!==item.id?[row]:row.quantity>1?[{...row,quantity:row.quantity-1}]:[]));setOpen(false);}}/> : <p>Data produk lama belum lengkap. Pilih ulang produk dan ID server melalui <a href="/katalog" onClick={()=>setOpen(false)}>katalog</a>.</p>}</section>;})}{items.length>providerItems.length && <p>Produk lama belum memiliki kode layanan. Pilih ulang dari katalog sebelum membayar.</p>}</section>}
     {stage === 1 && <Button variant="outline" className="order-cart-add" onClick={() => setStage(0)}>Kembali ke keranjang</Button>}
    </>}
   </motion.div>
  </DialogContent></Dialog>
 </>;
}

