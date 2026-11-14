"use client";

import { useState } from "react";
import { ChevronDown, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CheckoutVoucher() {
 const [code,setCode] = useState("");
 const [message,setMessage] = useState("");
 return <section className="checkout-voucher" aria-labelledby="checkout-voucher-heading">
  <h3 id="checkout-voucher-heading"><Ticket size={18} aria-hidden="true"/>Voucher</h3>
  <div className="checkout-voucher-entry"><Input aria-label="Kode voucher" value={code} onChange={event=>{setCode(event.target.value);setMessage("");}} placeholder="Masukkan kode voucher" maxLength={64}/><button type="button" disabled={!code.trim()} onClick={()=>setMessage("Voucher belum dapat diperiksa saat ini.")}>Periksa</button></div>
  {message && <p role="status">{message}</p>}
  <details className="checkout-voucher-list"><summary>Pilih voucher akun <ChevronDown size={16} aria-hidden="true"/></summary><div><p>Daftar voucher akun belum tersedia.</p></div></details>
 </section>;
}
