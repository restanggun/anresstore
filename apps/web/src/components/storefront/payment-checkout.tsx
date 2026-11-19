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
import { CheckoutVoucher, voucherScope, type AppliedVoucher, type VoucherProduct } from "./checkout-voucher";
export type PaymentRecord = { review?: { eligible: boolean; submitted: boolean; status: string | null; category: string; productSlug: string | null }; voucher?: { name: string; baseAmount: number; discount: number } | null; ownership?: "account" | "guest"; source?: string; refund?: {id:string;refund_status:string;refund_requires_admin:boolean;refund_resolution:string|null;refund_reference:string|null} | null; invoiceNumber: string | null; target?: string; targetZone?: string | null; fulfillment?: {status: string; note: string | null; mode: string} | null; id: string; mode?: "live" | "sandbox"; sandboxRealFulfillment?: boolean; createdAt: string; product: string; amount: number; total: number; fee: number; status: string; method: string; reference: string | null; payCode: string | null; checkoutUrl: string | null; expiresAt: number | null; lastVerifiedAt: string | null; needsReview: boolean; refreshDelayed: boolean };
const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Pembayaran belum tersedia. Coba lagi.");
  return data as T;
}

export function PaymentCheckout({ source, code, target, serviceQuantity, targetZone = "", amount, contact, customer, task, onCreated }: { source: "game" | "prepaid" | "apps" | "social" | "tasks"; code: string; serviceQuantity?: number; target: string; targetZone?: string; amount: number; contact: string; task?: {pricing_unit?:"page"|"slide"|"minute"|"item";pages:number;deadline_days:number;revisions:number;instructions:string;reference_url:string}; onCreated?: () => Promise<void>; customer?: { name?: string; email: string; phone: string } }) {
  const { accountEmail, loading: emailLoading } = useCheckoutEmail();
  const [channels, setChannels] = useState<Channel[]>([]), [method, setMethod] = useState("");
  const [name, setName] = useState(customer?.name ?? (source === "game" ? "Pelanggan" : "")), [email, setEmail] = useState(customer?.email ?? (contact.includes("@") ? contact : "")), [phone, setPhone] = useState(customer?.phone ?? (contact.includes("@") ? "" : contact.replace(/[\s-]/g, "")));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const [sandboxRealFulfillment, setSandboxRealFulfillment] = useState(false);
  const [previousPayment, setPreviousPayment] = useState<PaymentRecord | null>(null);
  const [providerPhoneRequired, setProviderPhoneRequired] = useState(false);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [checkingVoucher, setCheckingVoucher] = useState<string | null>(null);
  const voucherProduct: VoucherProduct = { source, code, amount,
    ...(source === "social" ? { expectedQuantity: serviceQuantity } : {}),
    ...(task ? { task: { pricing_unit: task.pricing_unit, pages: task.pages, deadline_days: task.deadline_days, revisions: task.revisions } } : {}) };
  const scope = voucherScope(voucherProduct);
  const applied = voucher?.scope === scope ? voucher : null;
  const payableAmount = applied?.amount ?? amount;
  const gift = applied?.kind === "gift";
  const ovoPhoneRequired = method === "OVO";
  const paymentPhoneRequired = !gift && (ovoPhoneRequired || providerPhoneRequired);
  useEffect(()=>setProviderPhoneRequired(false),[method]);
  const checkoutEmail = accountEmail ?? email;
  const pending = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (payableAmount === 0) return;
    const controller = new AbortController(); setLoading(true); setError(""); setChannels([]); setMethod("");
    fetch(`${apiUrl}/payments/channels`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(jsonResponse<{ mode: "live" | "sandbox"; sandboxRealFulfillment?: boolean; channels: Channel[] }>).then(data => {
      if (controller.signal.aborted) return;
      setMode(data.mode); setSandboxRealFulfillment(data.sandboxRealFulfillment === true);
      const available = data.channels.filter(channel => payableAmount >= channel.minimum && payableAmount <= channel.maximum);
      setChannels(available); setMethod("");
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Metode pembayaran gagal dimuat."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [payableAmount, reload]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || checkingVoucher === scope || (!gift && !method)) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const payment = await submitPayment<PaymentRecord>({ source, code, target, targetZone, method: gift ? "VOUCHER" : method, name: name.trim(), email: checkoutEmail.trim(), phone: phone.trim(), expectedAmount: payableAmount, ...(applied ? { voucher: applied.reference } : {}), ...(source === "social" ? {expectedQuantity: serviceQuantity || 0} : {}), ...(source === "tasks" ? {task} : {}) }, id => { pending.current = id; });
      if (gift && payment.status === "paid" && payment.amount === 0) {
        try { await onCreated?.(); } catch { /* The reserved invoice remains authoritative. */ }
        window.location.assign(invoicePath(payment.id, payment.invoiceNumber));
        return;
      }
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
    <CheckoutVoucher key={scope} product={voucherProduct} applied={applied} disabled={busy || !!previousPayment}
      onChecking={(key, active) => setCheckingVoucher(current => active ? key : current === key ? null : current)}
      onApply={offer => { setVoucher(offer); setMethod(""); setError(""); }}/>
    {mode === "sandbox" && !sandboxRealFulfillment && <p role="status">Mode sandbox: pembayaran uji coba, tanpa pengiriman produk.</p>}
    {gift ? <p role="status">Voucher menanggung harga produk. Total pembayaran Rp0.</p> : loading ? <p role="status">Memuat metode pembayaran...</p> : <>
      <PaymentMethods channels={channels} value={method} onChange={setMethod} disabled={busy}/>
      {!channels.length && <p>Belum ada metode untuk nominal {money(payableAmount)}. <button type="button" className="shop-text-button" onClick={() => setReload(value => value + 1)}>Muat ulang metode</button></p>}
    </>}
    {!customer && <>
    {source !== "game" && <label>Nama pelanggan<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>}
    <label>{accountEmail ? "Email akun" : "Email (Wajib)"}<Input type="email" autoComplete="email" value={checkoutEmail} readOnly={!!accountEmail} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy || emailLoading}/></label>
    <label>{ovoPhoneRequired ? "Nomor HP OVO (Wajib)" : providerPhoneRequired ? "Nomor HP pembayaran (Wajib)" : `Nomor WhatsApp${source === "game" ? " (Opsional)" : ""}`}<Input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder="081234567890" required={source !== "game" || paymentPhoneRequired} disabled={busy}/></label>
    </>}
    {customer && paymentPhoneRequired && <label>{ovoPhoneRequired ? "Nomor HP OVO (Wajib)" : "Nomor HP pembayaran (Wajib)"}<Input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder={ovoPhoneRequired ? "Nomor yang terdaftar di OVO" : "081234567890"} required disabled={busy}/></label>}
    {!gift && ovoPhoneRequired && <p>Masukkan nomor HP yang terdaftar di akun OVO untuk melanjutkan pembayaran.</p>}
    {!gift && <p>Biaya admin dan total akhir ditampilkan setelah kode bayar dibuat.</p>}
    {error && <p role="alert">{error}{pending.current && <> <a className="shop-text-button" href={invoicePath(pending.current)}>Periksa status permintaan</a></>}</p>}
    {previousPayment && <section className="checkout-existing-invoice" role="status"><h3>{orderStatus(previousPayment).title}</h3><p>Data checkout ini terhubung dengan invoice {previousPayment.invoiceNumber || previousPayment.id}. {previousPayment.status === "paid" ? "Pembayaran invoice ini sudah lunas, sehingga tidak dibuka lagi di Tripay." : ["failed","expired","refunded"].includes(previousPayment.status) ? "Invoice ini sudah berakhir." : "Tautan pembayaran dari Tripay belum tersedia atau masih perlu diverifikasi. Kamu tetap di halaman checkout; jangan membuat pembayaran pengganti."}</p><p>{orderStatus(previousPayment).description}</p><a className="shop-text-button" href={invoicePath(previousPayment.id, previousPayment.invoiceNumber)}>Lihat invoice dan status pesanan</a>{!previousPayment.needsReview && !["requested","in_review"].includes(previousPayment.refund?.refund_status || "") && (["failed","expired","refunded"].includes(previousPayment.status) || previousPayment.status === "paid" && ["completed","failed"].includes(previousPayment.fulfillment?.status || "")) && <Button type="button" variant="outline" onClick={()=>{forgetPaymentIntent(previousPayment.id);pending.current=null;setPreviousPayment(null);setError("");}}>Mulai pesanan baru</Button>}</section>}
    <Button type="submit" className="order-primary" disabled={!!previousPayment || busy || checkingVoucher === scope || emailLoading || !checkoutEmail.trim() || (!gift && (loading || !method)) || paymentPhoneRequired && !/^\+?[0-9]{8,15}$/.test(phone.trim())}>{busy ? "Menyiapkan pesanan..." : gift ? "Klaim produk Rp0" : "Lanjut ke pembayaran"}</Button>
    {!gift && <p className="checkout-payment-note">Kamu akan diarahkan ke Tripay untuk membayar, lalu kembali ke invoice untuk melihat status pesanan.</p>}
  </form>;
}

export { PaymentInvoice as PaymentInvoicePage } from "./payment-invoice";
