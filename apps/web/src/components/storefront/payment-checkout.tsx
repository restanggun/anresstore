"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { useCheckoutEmail } from "./use-checkout-email";
import { apiUrl } from "@/lib/auth-api";
import { forgetPaymentIntent, submitPayment } from "@/lib/payment-api";
import { orderStatus } from "@/lib/order-status";
import { invoicePath, tripayCheckoutUrl } from "@/lib/payment-navigation";

import type { PaymentChannel as Channel } from "@/lib/payment-channels";
import { PaymentMethods } from "./payment-methods";
export type PaymentRecord = { ownership?: "account" | "guest"; source?: string; refund?: {id:string;refund_status:string;refund_requires_admin:boolean;refund_resolution:string|null;refund_reference:string|null} | null; invoiceNumber: string | null; target?: string; targetZone?: string | null; fulfillment?: {status: string; note: string | null; mode: string} | null; id: string; mode?: "live" | "sandbox"; sandboxRealFulfillment?: boolean; createdAt: string; product: string; amount: number; total: number; fee: number; status: string; method: string; reference: string | null; payCode: string | null; checkoutUrl: string | null; expiresAt: number | null; lastVerifiedAt: string | null; needsReview: boolean; refreshDelayed: boolean };
const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Pembayaran belum tersedia. Coba lagi.");
  return data as T;
}

export function PaymentCheckout({ source, code, target, serviceQuantity, targetZone = "", amount, contact, customer, task, onCreated }: { source: "game" | "prepaid" | "apps" | "social" | "tasks"; code: string; serviceQuantity?: number; target: string; targetZone?: string; amount: number; contact: string; task?: {pages:number;deadline_days:number;revisions:number;instructions:string;reference_url:string}; onCreated?: () => Promise<void>; customer?: { name?: string; email: string; phone: string } }) {
  const { accountEmail, loading: emailLoading } = useCheckoutEmail();
  const [channels, setChannels] = useState<Channel[]>([]), [method, setMethod] = useState("");
  const [name, setName] = useState(customer?.name ?? (source === "game" ? "Pelanggan" : "")), [email, setEmail] = useState(customer?.email ?? (contact.includes("@") ? contact : "")), [phone, setPhone] = useState(customer?.phone ?? (contact.includes("@") ? "" : contact.replace(/[\s-]/g, "")));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const [sandboxRealFulfillment, setSandboxRealFulfillment] = useState(false);
  const [previousPayment, setPreviousPayment] = useState<PaymentRecord | null>(null);
  const [providerPhoneRequired, setProviderPhoneRequired] = useState(false);
  const ovoPhoneRequired = method === "OVO";
  const paymentPhoneRequired = ovoPhoneRequired || providerPhoneRequired;
  useEffect(()=>setProviderPhoneRequired(false),[method]);
  const checkoutEmail = accountEmail ?? email;
  const pending = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setChannels([]); setMethod("");
    fetch(`${apiUrl}/payments/channels`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(jsonResponse<{ mode: "live" | "sandbox"; sandboxRealFulfillment?: boolean; channels: Channel[] }>).then(data => {
      if (controller.signal.aborted) return;
      setMode(data.mode); setSandboxRealFulfillment(data.sandboxRealFulfillment === true);
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
      const payment = await submitPayment<PaymentRecord>({ source, code, target, targetZone, method, name: name.trim(), email: checkoutEmail.trim(), phone: phone.trim(), expectedAmount: amount, ...(source === "social" ? {expectedQuantity: serviceQuantity || 0} : {}), ...(source === "tasks" ? {task} : {}) }, id => { pending.current = id; });
      const checkoutUrl = tripayCheckoutUrl(payment);
      if (!checkoutUrl) {
        // Stay on checkout when the gateway has not supplied a verified payable URL.
        // Opening an invoice is a separate user action, not a substitute for paying.
        setPreviousPayment(payment);
        return;
      }
      try { if (payment.mode !== "sandbox" || payment.sandboxRealFulfillment) await onCreated?.(); } catch { /* The reserved invoice remains authoritative. */ }
      const invoice = invoicePath(payment.id, payment.invoiceNumber);
      // Back from Tripay returns to the invoice, never a form that could be resubmitted.
      window.history.replaceState(window.history.state, "", invoice);
      window.location.assign(checkoutUrl);
    } catch (error) { const message=error instanceof Error ? error.message : "Pembayaran gagal dibuat.";setError(message);if(/nomor HP/i.test(message))setProviderPhoneRequired(true); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={checkout}>
    {mode === "sandbox" && !sandboxRealFulfillment && <p role="status">Mode sandbox: pembayaran uji coba, tanpa pengiriman produk.</p>}
    {loading ? <p role="status">Memuat metode pembayaran...</p> : <>
      <PaymentMethods channels={channels} value={method} onChange={setMethod} disabled={busy}/>
      {!channels.length && <p>Belum ada metode untuk nominal {money(amount)}. <button type="button" className="shop-text-button" onClick={() => setReload(value => value + 1)}>Muat ulang metode</button></p>}
    </>}
    {!customer && <>
    {source !== "game" && <label>Nama pelanggan<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>}
    <label>{accountEmail ? "Email akun" : "Email (Wajib)"}<Input type="email" autoComplete="email" value={checkoutEmail} readOnly={!!accountEmail} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy || emailLoading}/></label>
    <label>{ovoPhoneRequired ? "Nomor HP OVO (Wajib)" : providerPhoneRequired ? "Nomor HP pembayaran (Wajib)" : `Nomor WhatsApp${source === "game" ? " (Opsional)" : ""}`}<Input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder="081234567890" required={source !== "game" || paymentPhoneRequired} disabled={busy}/></label>
    </>}
    {customer && paymentPhoneRequired && <label>{ovoPhoneRequired ? "Nomor HP OVO (Wajib)" : "Nomor HP pembayaran (Wajib)"}<Input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder={ovoPhoneRequired ? "Nomor yang terdaftar di OVO" : "081234567890"} required disabled={busy}/></label>}
    {ovoPhoneRequired && <p>Masukkan nomor HP yang terdaftar di akun OVO untuk melanjutkan pembayaran.</p>}
    <p>Nominal produk {money(amount)}. Biaya admin dan total akhir ditampilkan setelah kode bayar dibuat.</p>
    {error && <p role="alert">{error}{pending.current && <> <a className="shop-text-button" href={invoicePath(pending.current)}>Periksa status permintaan</a></>}</p>}
    {previousPayment && <section className="checkout-existing-invoice" role="status"><h3>{orderStatus(previousPayment).title}</h3><p>Data checkout ini terhubung dengan invoice {previousPayment.invoiceNumber || previousPayment.id}. {previousPayment.status === "paid" ? "Pembayaran invoice ini sudah lunas, sehingga tidak dibuka lagi di Tripay." : ["failed","expired","refunded"].includes(previousPayment.status) ? "Invoice ini sudah berakhir." : "Tautan pembayaran dari Tripay belum tersedia atau masih perlu diverifikasi. Kamu tetap di halaman checkout; jangan membuat pembayaran pengganti."}</p><p>{orderStatus(previousPayment).description}</p><a className="shop-text-button" href={invoicePath(previousPayment.id, previousPayment.invoiceNumber)}>Lihat invoice dan status pesanan</a>{!previousPayment.needsReview && !["requested","in_review"].includes(previousPayment.refund?.refund_status || "") && (["failed","expired","refunded"].includes(previousPayment.status) || previousPayment.status === "paid" && ["completed","failed"].includes(previousPayment.fulfillment?.status || "")) && <Button type="button" variant="outline" onClick={()=>{forgetPaymentIntent(previousPayment.id);pending.current=null;setPreviousPayment(null);setError("");}}>Mulai pesanan baru</Button>}</section>}
    <Button type="submit" className="order-primary" disabled={!!previousPayment || busy || loading || emailLoading || !checkoutEmail.trim() || !method || paymentPhoneRequired && !/^\+?[0-9]{8,15}$/.test(phone.trim())}>{busy ? "Menyiapkan pembayaran..." : "Lanjut ke pembayaran"}</Button>
    <p className="checkout-payment-note">Kamu akan diarahkan ke Tripay untuk membayar, lalu kembali ke invoice untuk melihat status pesanan.</p>
  </form>;
}

export { PaymentInvoice as PaymentInvoicePage } from "./payment-invoice";
