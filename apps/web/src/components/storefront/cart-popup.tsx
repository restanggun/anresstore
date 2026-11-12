"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Minus, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { initCart, readCart, refreshGuestCart, writeCart, type CartItem } from "@/lib/cart";
import { createOrder } from "@/lib/orders";
import "./catalog-flow.css";
import "./catalog-system.css";
import "./cart.css";

const money = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export function CartPopup() {
 const router=useRouter(); const pendingOrder=useRef<{id:string;payload:string}|null>(null);
 const [open, setOpen] = useState(false);
 const [items, setItems] = useState<CartItem[]>([]);
 const [stage, setStage] = useState(0);
 const [payment, setPayment] = useState("QRIS");
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
 const checkout = async () => { if(busy || !items.length) return; const payload=JSON.stringify({payment,items}); if(!pendingOrder.current || pendingOrder.current.payload!==payload) pendingOrder.current={id:crypto.randomUUID(),payload}; const id=pendingOrder.current.id; setBusy(true); setError(""); try { await createOrder(id,payment,items); pendingOrder.current=null; setOpen(false); router.push(`/invoice/${id}`); } catch(err) { setError(err instanceof Error ? err.message : "Pesanan belum dapat disimpan."); } finally { setBusy(false); } };
 const count = items.reduce((sum, item) => sum + item.quantity, 0);
 const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
 return <>
  <button className="cart-nav" aria-label={`Buka keranjang, ${count} produk`} onClick={() => { setEditing(null); setStage(0); setOpen(true); }}><ShoppingCart size={20} aria-hidden="true"/><span>{count}</span></button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="cart-dialog">
   <div className="cart-heading"><span className="cart-heading-icon"><ShoppingCart size={22} aria-hidden="true"/></span><div><DialogTitle>{stage === 0 ? "Keranjangmu" : "Checkout"}</DialogTitle><DialogDescription>{stage === 0 ? `${count} produk pilihanmu` : "Pilih metode pembayaran simulasi."}</DialogDescription></div></div>
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
      </form> : <div className="cart-item-details"><small>Pilihan: {item.details}</small><small>Tujuan: {item.target}</small><small>Kontak: {item.contact}</small></div>)}
      {stage === 0 && <div className="cart-controls"><div className="cart-quantity"><button aria-label={`Kurangi ${item.product}`} disabled={item.quantity <= 1} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity - 1} : x))}><Minus size={15}/></button><span aria-label={`Jumlah ${item.quantity}`}>{item.quantity}</span><button aria-label={`Tambah ${item.product}`} onClick={() => update(items.map(x => x.id === item.id ? {...x, quantity:x.quantity + 1} : x))}><Plus size={15}/></button></div><button onClick={() => { setExpanded(current => new Set(current).add(item.id)); setEditing(item); }}><Pencil size={15}/>Edit</button><button onClick={() => { if (editing?.id === item.id) setEditing(null); update(items.filter(x => x.id !== item.id)); }}><Trash2 size={15}/>Hapus</button></div>}
     </motion.div>)}</AnimatePresence></div>
     <div className="cart-total"><span>Total estimasi<small>Harga masih berupa simulasi</small></span><strong>{money(total)}</strong></div>
     {stage === 1 && <label className="cart-payment">Metode pembayaran<select value={payment} onChange={e => setPayment(e.target.value)}><option>QRIS</option><option>Transfer bank</option><option>E-wallet</option></select></label>}
     {stage === 1 && <p>Ini simulasi; tidak ada pembayaran yang diproses. Produk tetap ada di keranjang.</p>}
     {stage === 0 ? <Button className="order-primary" disabled={!!editing || busy} onClick={() => setStage(1)}>Lanjut checkout<ArrowRight size={17}/></Button> : <Button className="order-primary" disabled={busy} onClick={checkout}>{busy ? "Menyimpan..." : "Simpan pesanan simulasi"}<ArrowRight size={17}/></Button>}
     {stage === 1 && <Button variant="outline" className="order-cart-add" onClick={() => setStage(0)}>Kembali ke keranjang</Button>}
    </>}
   </motion.div>
  </DialogContent></Dialog>
 </>;
}

