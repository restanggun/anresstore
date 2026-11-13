"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/auth-api";
import { forgetPaymentIntent, paymentRequest, submitPayment } from "@/lib/payment-api";

type Channel = { code: string; name: string; minimum: number; maximum: number };
export type SandboxPayment = { id: string; sandbox: true; createdAt: string; product: string; amount: number; total: number; fee: number; status: string; method: string; reference: string | null; payCode: string | null; checkoutUrl: string | null; expiresAt: number | null; lastVerifiedAt: string | null; needsReview: boolean; refreshDelayed: boolean };
const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const tokenKey = (id: string) => `anres-sandbox-payment:${id}`;
async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Pembayaran belum tersedia. Coba lagi.");
  return data as T;
}

export function PaymentCheckout({ source, code, target, amount, contact }: { source: "game" | "prepaid" | "apps"; code: string; target: string; amount: number; contact: string }) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]), [method, setMethod] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState(contact.includes("@") ? contact : ""), [phone, setPhone] = useState(contact.includes("@") ? "" : contact.replace(/[\s-]/g, ""));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const pending = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`${apiUrl}/payments/channels`, { signal: controller.signal }).then(jsonResponse<{ channels: Channel[] }>).then(data => {
      if (controller.signal.aborted) return;
      const available = data.channels.filter(channel => amount >= channel.minimum && amount <= channel.maximum);
      setChannels(available); setMethod(available[0]?.code ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Metode pembayaran gagal dimuat."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [amount, reload]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || !method) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const payment = await submitPayment<SandboxPayment>({ source, code, target, method, name: name.trim(), email: email.trim(), phone: phone.trim(), expectedAmount: amount }, id => { pending.current = id; });
      router.push(`/pembayaran/${payment.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Pembayaran gagal dibuat."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={checkout}>
    <p><strong>Pembayaran sandbox Tripay</strong><br/>Untuk pengujian. Tidak ada dana atau produk sungguhan yang diproses.</p>
    {loading ? <p role="status">Memuat metode pembayaran...</p> : <>
      <label>Metode pembayaran<select value={method} onChange={event => setMethod(event.target.value)} disabled={busy} required><option value="" disabled>Pilih metode</option>{channels.map(channel => <option key={channel.code} value={channel.code}>{channel.name}</option>)}</select></label>
      {!channels.length && <p>Belum ada metode untuk nominal {money(amount)}. <button type="button" className="shop-text-button" onClick={() => setReload(value => value + 1)}>Muat ulang metode</button></p>}
    </>}
    <label>Nama pelanggan<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>
    <label>Email<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy}/></label>
    <label>Nomor WhatsApp<Input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} pattern="\+?[0-9]{8,15}" placeholder="081234567890" required disabled={busy}/></label>
    <p>Nominal produk {money(amount)}. Biaya admin dan total akhir ditampilkan setelah kode bayar dibuat.</p>
    {error && <p role="alert">{error}{pending.current && <> <a className="shop-text-button" href={`/pembayaran/${pending.current}`}>Periksa status permintaan</a></>}</p>}
    <Button type="submit" className="order-primary" disabled={busy || loading || !method}>{busy ? "Membuat kode bayar..." : "Buat pembayaran sandbox"}</Button>
  </form>;
}

const labels: Record<string, string> = { creating: "Sedang membuat pembayaran", pending: "Menunggu pembayaran", paid: "Pembayaran sandbox berhasil", failed: "Pembayaran gagal", expired: "Pembayaran kedaluwarsa", refunded: "Pembayaran dikembalikan", unknown: "Status perlu diperiksa" };
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
  useEffect(() => { void refresh(); }, [id]); // Status is refreshed explicitly; no payment-success inference from redirects.
  return <main id="main" className="container catalog-page"><div className="shop-flow"><div className="shop-heading"><div><h1>Pembayaran sandbox</h1><p>Pengujian Tripay. Produk tidak dikirim dan dana sungguhan tidak diproses.</p></div></div><section className="order-card">
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Memeriksa pembayaran...</p>}
    {payment && <><h2>{labels[payment.status] ?? "Status belum tersedia"}</h2><dl><div><dt>Nomor invoice</dt><dd>{payment.id}</dd></div><div><dt>Produk</dt><dd>{payment.product}</dd></div><div><dt>Metode</dt><dd>{payment.method}</dd></div><div><dt>Harga produk</dt><dd>{money(payment.amount)}</dd></div><div><dt>Biaya admin</dt><dd>{money(payment.fee)}</dd></div><div><dt>Total pembayaran</dt><dd>{money(payment.total)}</dd></div>{payment.payCode && <div><dt>Kode bayar / virtual account</dt><dd>{payment.payCode}</dd></div>}{payment.expiresAt && <div><dt>Batas pembayaran</dt><dd>{new Date(payment.expiresAt * 1000).toLocaleString("id-ID")}</dd></div>}</dl>
      {payment.status === "pending" && !payment.needsReview && payment.checkoutUrl && <Button asChild><a href={payment.checkoutUrl} rel="noreferrer">Buka pembayaran Tripay sandbox</a></Button>}
      {["creating", "unknown"].includes(payment.status) && <p>Jangan buat pesanan baru. Permintaan mungkin sudah diterima Tripay; periksa kembali status atau referensi melalui simulator merchant.</p>}
      {payment.status === "paid" && <p>Pembayaran uji tercatat. Pemrosesan produk sengaja dinonaktifkan untuk sandbox.</p>}
      {payment.refreshDelayed && <p role="status">Penyedia belum bisa dihubungi. Status terakhir tetap ditampilkan; coba periksa kembali.</p>}
      {payment.needsReview && <p role="alert">Transaksi ini memerlukan pemeriksaan manual. Jangan membuat pembayaran pengganti.</p>}
      {payment.lastVerifiedAt && <p>Terakhir diverifikasi: {new Date(payment.lastVerifiedAt).toLocaleString("id-ID")}</p>}
      {["paid", "failed", "expired", "refunded"].includes(payment.status) && <a href="/katalog" className="shop-text-button" onClick={() => forgetPaymentIntent(payment.id)}>Buat pesanan baru</a>}
    </>}
    <Button className="order-cart-add" variant="outline" disabled={busy} onClick={refresh}>Periksa status</Button>
  </section></div></main>;
}
