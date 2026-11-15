"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { useCheckoutEmail } from "./use-checkout-email";
import { apiUrl } from "@/lib/auth-api";
import { submitPayment } from "@/lib/payment-api";
import { invoicePath, tripayCheckoutUrl } from "@/lib/payment-navigation";

import type { PaymentChannel as Channel } from "@/lib/payment-channels";
import { PaymentMethods } from "./payment-methods";
export type PaymentRecord = { invoiceNumber: string | null; target?: string; targetZone?: string | null; fulfillment?: {status: string; note: string | null; mode: string} | null; id: string; mode?: "live"; createdAt: string; product: string; amount: number; total: number; fee: number; status: string; method: string; reference: string | null; payCode: string | null; checkoutUrl: string | null; expiresAt: number | null; lastVerifiedAt: string | null; needsReview: boolean; refreshDelayed: boolean };
const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Pembayaran belum tersedia. Coba lagi.");
  return data as T;
}

export function PaymentCheckout({ source, code, target, serviceQuantity, targetZone = "", amount, contact, customer, onCreated }: { source: "game" | "prepaid" | "apps" | "social" | "tasks"; code: string; serviceQuantity?: number; target: string; targetZone?: string; amount: number; contact: string; onCreated?: () => Promise<void>; customer?: { name?: string; email: string; phone: string } }) {
  const router = useRouter();
  const { accountEmail, loading: emailLoading } = useCheckoutEmail();
  const [channels, setChannels] = useState<Channel[]>([]), [method, setMethod] = useState("");
  const [name, setName] = useState(customer?.name ?? (source === "game" ? "Pelanggan" : "")), [email, setEmail] = useState(customer?.email ?? (contact.includes("@") ? contact : "")), [phone, setPhone] = useState(customer?.phone ?? (contact.includes("@") ? "" : contact.replace(/[\s-]/g, "")));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const checkoutEmail = accountEmail ?? email;
  const pending = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setChannels([]); setMethod("");
    fetch(`${apiUrl}/payments/channels`, { signal: controller.signal }).then(jsonResponse<{ mode: "live"; channels: Channel[] }>).then(data => {
      if (controller.signal.aborted) return;
      const available = data.channels.filter(channel => amount >= channel.minimum && amount <= channel.maximum);
      setChannels(available); setMethod("");
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Metode pembayaran gagal dimuat."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [amount, reload]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || !method) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const payment = await submitPayment<PaymentRecord>({ source, code, target, targetZone, method, name: name.trim(), email: checkoutEmail.trim(), phone: phone.trim(), expectedAmount: amount, ...(source === "social" ? {expectedQuantity: serviceQuantity || 0} : {}) }, id => { pending.current = id; });
      // A cart failure cannot hide the authoritative invoice or stop payment navigation.
      try { await onCreated?.(); } catch { /* The reserved invoice remains authoritative. */ }
      const invoice = invoicePath(payment.id, payment.invoiceNumber);
      const checkoutUrl = tripayCheckoutUrl(payment);
      if (checkoutUrl) {
        // Back from Tripay returns to the invoice, never a form that could be resubmitted.
        window.history.replaceState(window.history.state, "", invoice);
        window.location.assign(checkoutUrl);
      } else router.replace(invoice);
    } catch (error) { setError(error instanceof Error ? error.message : "Pembayaran gagal dibuat."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={checkout}>
    {loading ? <p role="status">Memuat metode pembayaran...</p> : <>
      <PaymentMethods channels={channels} value={method} onChange={setMethod} disabled={busy}/>
      {!channels.length && <p>Belum ada metode untuk nominal {money(amount)}. <button type="button" className="shop-text-button" onClick={() => setReload(value => value + 1)}>Muat ulang metode</button></p>}
    </>}
    {!customer && <>
    {source !== "game" && <label>Nama pelanggan<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>}
    <label>{accountEmail ? "Email akun" : "Email (Wajib)"}<Input type="email" autoComplete="email" value={checkoutEmail} readOnly={!!accountEmail} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy || emailLoading}/></label>
    <label>Nomor WhatsApp{source === "game" ? " (Opsional)" : ""}<Input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder="081234567890" required={source !== "game"} disabled={busy}/></label>
    </>}
    <p>Nominal produk {money(amount)}. Biaya admin dan total akhir ditampilkan setelah kode bayar dibuat.</p>
    {error && <p role="alert">{error}{pending.current && <> <a className="shop-text-button" href={invoicePath(pending.current)}>Periksa status permintaan</a></>}</p>}
    <Button type="submit" className="order-primary" disabled={busy || loading || emailLoading || !checkoutEmail.trim() || !method}>{busy ? "Menyiapkan pembayaran..." : "Lanjut ke Tripay"}</Button>
    <p className="checkout-payment-note">Kamu akan diarahkan ke Tripay untuk membayar, lalu kembali ke invoice untuk melihat status pesanan.</p>
  </form>;
}

export { PaymentInvoice as PaymentInvoicePage } from "./payment-invoice";
