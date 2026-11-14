"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/auth-api";
import { forgetPaymentIntent, paymentRequest, submitPayment } from "@/lib/payment-api";

import type { PaymentChannel as Channel } from "@/lib/payment-channels";
import { PaymentMethods } from "./payment-methods";
export type SandboxPayment = { target?: string; targetZone?: string | null; fulfillment?: {status: string; note: string | null; mode: string} | null; id: string; sandbox: boolean; mode?: "sandbox" | "live"; createdAt: string; product: string; amount: number; total: number; fee: number; status: string; method: string; reference: string | null; payCode: string | null; checkoutUrl: string | null; expiresAt: number | null; lastVerifiedAt: string | null; needsReview: boolean; refreshDelayed: boolean };
const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const tokenKey = (id: string) => `anres-sandbox-payment:${id}`;
async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Pembayaran belum tersedia. Coba lagi.");
  return data as T;
}

export function PaymentCheckout({ source, code, target, serviceQuantity, targetZone = "", amount, contact, customer, onCreated }: { source: "game" | "prepaid" | "apps" | "social" | "tasks"; code: string; serviceQuantity?: number; target: string; targetZone?: string; amount: number; contact: string; onCreated?: () => Promise<void>; customer?: { name: string; email: string; phone: string } }) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]), [method, setMethod] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [name, setName] = useState(customer?.name ?? ""), [email, setEmail] = useState(customer?.email ?? (contact.includes("@") ? contact : "")), [phone, setPhone] = useState(customer?.phone ?? (contact.includes("@") ? "" : contact.replace(/[\s-]/g, "")));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const pending = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setChannels([]); setMethod("");
    fetch(`${apiUrl}/payments/channels`, { signal: controller.signal }).then(jsonResponse<{ sandbox: boolean; channels: Channel[] }>).then(data => {
      if (controller.signal.aborted) return;
      const available = data.channels.filter(channel => amount >= channel.minimum && amount <= channel.maximum);
      setChannels(available); setSandbox(data.sandbox); setMethod("");
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Metode pembayaran gagal dimuat."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [amount, reload]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || !method) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const payment = await submitPayment<SandboxPayment>({ source, code, target, targetZone, method, name: name.trim(), email: email.trim(), phone: phone.trim(), expectedAmount: amount, ...(source === "social" ? {expectedQuantity: serviceQuantity || 0} : {}) }, id => { pending.current = id; });
      // Cart persistence failure must never hide an invoice already reserved by the server.
      try { await onCreated?.(); } finally { router.push(`/pembayaran/${payment.id}`); }
    } catch (error) { setError(error instanceof Error ? error.message : "Pembayaran gagal dibuat."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={checkout}>
    {sandbox && <p role="note">Mode uji: pembayaran ini tidak mengirim produk atau memotong saldo supplier.</p>}
    {loading ? <p role="status">Memuat metode pembayaran...</p> : <>
      <PaymentMethods channels={channels} value={method} onChange={setMethod} disabled={busy}/>
      {!channels.length && <p>Belum ada metode untuk nominal {money(amount)}. <button type="button" className="shop-text-button" onClick={() => setReload(value => value + 1)}>Muat ulang metode</button></p>}
    </>}
    {!customer && <>
    <label>Nama pelanggan<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>
    <label>Email<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy}/></label>
    <label>Nomor WhatsApp<Input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder="081234567890" required disabled={busy}/></label>
    </>}
    <p>Nominal produk {money(amount)}. Biaya admin dan total akhir ditampilkan setelah kode bayar dibuat.</p>
    {error && <p role="alert">{error}{pending.current && <> <a className="shop-text-button" href={`/pembayaran/${pending.current}`}>Periksa status permintaan</a></>}</p>}
    <Button type="submit" className="order-primary" disabled={busy || loading || !method}>{busy ? "Membuat kode bayar..." : "Buat pembayaran"}</Button>
  </form>;
}

const labels: Record<string, string> = { creating: "Sedang membuat pembayaran", pending: "Menunggu pembayaran", paid: "Pembayaran berhasil", failed: "Pembayaran gagal", expired: "Pembayaran kedaluwarsa", refunded: "Pembayaran dikembalikan", unknown: "Status perlu diperiksa" };
export function SandboxPaymentPage({ id }: { id: string }) {
  const [payment, setPayment] = useState<SandboxPayment | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setError("");
    try {
      const token = localStorage.getItem(tokenKey(id));
      const data = await paymentRequest<SandboxPayment>(`transactions/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setPayment(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Pembayaran tidak dapat dimuat."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [id]);
  useEffect(() => { if (!payment || ["failed","expired","refunded"].includes(payment.status) || payment.fulfillment?.status === "completed") return; const timer = setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 30000); return () => clearInterval(timer); }, [id, payment, busy]); // Status is refreshed explicitly; no payment-success inference from redirects.
  return <main id="main" className="container catalog-page"><div className="shop-flow"><div className="shop-heading"><div><h1>Pembayaran</h1></div></div><section className="order-card">
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Memeriksa pembayaran...</p>}
    {payment && <>{payment.sandbox && <p>Mode uji: tidak ada pengiriman produk. Status pemrosesan tidak akan diselesaikan otomatis.</p>}<h2>{labels[payment.status] ?? "Status belum tersedia"}</h2><dl><div><dt>Nomor invoice</dt><dd>{payment.id}</dd></div><div><dt>Produk</dt><dd>{payment.product}</dd></div><div><dt>Tujuan</dt><dd>{payment.target}{payment.targetZone ? ` / ${payment.targetZone}` : ""}</dd></div><div><dt>Metode</dt><dd>{payment.method}</dd></div><div><dt>Harga produk</dt><dd>{money(payment.amount)}</dd></div><div><dt>Biaya admin</dt><dd>{money(payment.fee)}</dd></div><div><dt>Total pembayaran</dt><dd>{money(payment.total)}</dd></div>{payment.payCode && <div><dt>Kode bayar / virtual account</dt><dd>{payment.payCode}</dd></div>}{payment.expiresAt && <div><dt>Batas pembayaran</dt><dd>{new Date(payment.expiresAt * 1000).toLocaleString("id-ID")}</dd></div>}</dl>
      {payment.status === "pending" && !payment.needsReview && payment.checkoutUrl && <Button asChild><a href={payment.checkoutUrl} rel="noreferrer">Buka pembayaran Tripay</a></Button>}
      {["creating", "unknown"].includes(payment.status) && <p>Jangan buat pesanan baru. Permintaan mungkin sudah diterima Tripay; periksa kembali status atau hubungi bantuan.</p>}
      {payment.refreshDelayed && <p role="status">Penyedia belum bisa dihubungi. Status terakhir tetap ditampilkan; coba periksa kembali.</p>}
      {payment.needsReview && <p role="alert">Transaksi ini memerlukan pemeriksaan manual. Jangan membuat pembayaran pengganti.</p>}
      {payment.fulfillment && <section aria-label="Status pemrosesan"><h3>Pemrosesan pesanan</h3><p>{({not_ready:"Menunggu pembayaran",ready:payment.sandbox ? "Pembayaran uji terverifikasi; pengiriman dinonaktifkan" : "Menunggu pemrosesan",processing:"Sedang diproses",completed:"Selesai",failed:"Pemrosesan gagal",unknown:"Perlu pemeriksaan",manual_review:"Perlu pemeriksaan manual",dispatching:"Sedang dikirim"} as Record<string,string>)[payment.fulfillment.status] ?? payment.fulfillment.status}</p>{payment.fulfillment.note && <p>{payment.fulfillment.note}</p>}</section>}
      {payment.lastVerifiedAt && <p>Terakhir diverifikasi: {new Date(payment.lastVerifiedAt).toLocaleString("id-ID")}</p>}
      {["paid", "failed", "expired", "refunded"].includes(payment.status) && <a href="/katalog" className="shop-text-button" onClick={() => forgetPaymentIntent(payment.id)}>Buat pesanan baru</a>}
    </>}
    <Button className="order-cart-add" variant="outline" disabled={busy} onClick={refresh}>Periksa status</Button>
  </section></div></main>;
}
