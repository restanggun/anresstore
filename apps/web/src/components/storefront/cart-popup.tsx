"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Minus, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { readCart, writeCart, type CartItem } from "@/lib/cart";
import "./catalog-flow.css";
import "./catalog-system.css";
import "./cart.css";

const money = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export function CartPopup() {
 const [open, setOpen] = useState(false);
 const [items, setItems] = useState<CartItem[]>([]);
 const [stage, setStage] = useState(0);
 const [payment, setPayment] = useState("QRIS");
 const [editing, setEditing] = useState<CartItem | null>(null);
 const reduce = useReducedMotion();
 useEffect(() => {
  const refresh = () => setItems(readCart());
  const show = () => { refresh(); setEditing(null); setStage(0); setOpen(true); };
  refresh();
  window.addEventListener("anres-cart-change", refresh);
  window.addEventListener("storage", refresh);
  window.addEventListener("anres-cart-open", show);
  return () => { window.removeEventListener("anres-cart-change", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("anres-cart-open", show); };
 }, []);
 const update = (next: CartItem[]) => { setItems(next); writeCart(next); };
 const count = items.reduce((sum, item) => sum + item.quantity, 0);
 const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
 return <>
  <button className="cart-nav" aria-label={`Buka keranjang, ${count} produk`} onClick={() => { setEditing(null); setStage(0); setOpen(true); }}><ShoppingCart size={20} aria-hidden="true"/><span>{count}</span></button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="cart-dialog">
   <div className="cart-heading"><span className="cart-heading-icon"><ShoppingCart size={22} aria-hidden="true"/></span><div><DialogTitle>{stage === 0 ? "Keranjangmu" : stage === 1 ? "Checkout" : "Invoice simulasi"}</DialogTitle><DialogDescription>{stage === 0 ? `${count} produk pilihanmu` : stage === 1 ? "Pilih metode pembayaran simulasi." : "Tidak ada pembayaran yang diproses."}</DialogDescription></div></div>
   <motion.div className="cart-body" key={stage} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce ? 0 : .25}}>
    {items.length === 0 ? <div className="cart-empty"><ShoppingCart size={28} aria-hidden="true"/><strong>Keranjang masih kosong</strong><p>Pilih produk di katalog untuk mulai berbelanja.</p><Button onClick={() => setOpen(false)}>Lanjut belanja</Button></div> : <>
     <div className="cart-dialog-items"><AnimatePresence initial={false}>{items.map(item => <motion.div layout={!reduce} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduce ? undefined : {opacity:0,scale:.98}} key={item.id} className="cart-row">
      <div className="cart-item-head"><div><span className="cart-category">{item.category}</span><strong>{item.product}</strong><p>{item.details}</p></div><b>{money(item.price * item.quantity)}</b></div>
      {editing?.id === item.id && stage === 0 ? <form className="cart-edit" onSubmit={e => { e.preventDefault(); if (!editing.target.trim() || !editing.contact.trim()) return; update(items.map(x => x.id === editing.id ? {...x, target:editing.target.trim(), contact:editing.contact.trim()} : x)); setEditing(null); }}>
       <label>Tujuan / detail<Input value={editing.target} onChange={e => setEditing({...editing,target:e.target.value})} required /></label>
       <label>Nomor WhatsApp atau email<Input value={editing.contact} onChange={e => setEditing({...editing,contact:e.target.value})} required /></label>
       <div className="cart-edit-actions"><button type="button" onClick={() => setEditing(null)}>Batal</button><button type="submit" disabled={!editing.target.trim() || !editing.contact.trim()}>Simpan perubahan</button></div>
      </form> : <div className="cart-item-details"><small>Tujuan: {item.target}</small><small>Kontak: {item.contact}</small></div>}
      {stage === 0 && <div className="cart-controls"><div className="cart-quantity"><button aria-label={`Kurangi ${item.product}`} disabled={item.quantity <= 1} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity - 1} : x))}><Minus size={15}/></button><span aria-label={`Jumlah ${item.quantity}`}>{item.quantity}</span><button aria-label={`Tambah ${item.product}`} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity + 1} : x))}><Plus size={15}/></button></div><button onClick={() => setEditing(item)}><Pencil size={15}/>Edit</button><button onClick={() => { if (editing?.id === item.id) setEditing(null); update(items.filter(x => x.id !== item.id)); }}><Trash2 size={15}/>Hapus</button></div>}
     </motion.div>)}</AnimatePresence></div>
     <div className="cart-total"><span>Total estimasi<small>Harga masih berupa simulasi</small></span><strong>{money(total)}</strong></div>
     {stage === 1 && <label className="cart-payment">Metode pembayaran<select value={payment} onChange={e => setPayment(e.target.value)}><option>QRIS</option><option>Transfer bank</option><option>E-wallet</option></select></label>}
     {stage === 2 && <p>Metode: {payment}. Harga dan pembayaran masih simulasi.</p>}
     {stage < 2 ? <Button className="order-primary" disabled={!!editing} onClick={() => setStage(stage + 1)}>{stage === 0 ? "Lanjut checkout" : "Buat invoice simulasi"}<ArrowRight size={17}/></Button> : <Button className="order-primary" onClick={() => { update([]); setOpen(false); }}>Selesai dan kosongkan keranjang<ArrowRight size={17}/></Button>}
     {stage === 1 && <Button variant="outline" className="order-cart-add" onClick={() => setStage(0)}>Kembali ke keranjang</Button>}
    </>}
   </motion.div>
  </DialogContent></Dialog>
 </>;
}

