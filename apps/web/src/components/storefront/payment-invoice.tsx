"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, CircleCheck, Clock3, Copy, Printer, ReceiptText, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@anres/ui";
import Link from "./domain-link";
import { forgetPaymentIntent, paymentRequest } from "@/lib/payment-api";
import { invoicePath, tripayCheckoutUrl } from "@/lib/payment-navigation";
import type { PaymentRecord } from "./payment-checkout";
import "./payment-invoice.css";

const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const date = (value: string | number) => `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB`;
const labels: Record<string, string> = { creating: "Menyiapkan pembayaran", pending: "Menunggu pembayaran", paid: "Pembayaran berhasil", failed: "Pembayaran gagal", expired: "Pembayaran kedaluwarsa", refunded: "Pembayaran dikembalikan", unknown: "Status perlu diperiksa" };
const descriptions: Record<string, string> = {
  creating: "Invoice sudah dibuat. Kami sedang menyiapkan rincian pembayarannya.",
  pending: "Selesaikan pembayaran melalui Tripay. Status invoice diperbarui otomatis.",
  paid: "Pembayaranmu sudah terverifikasi. Pantau pemrosesan pesanan di invoice ini.",
  failed: "Pembayaran belum berhasil. Periksa rincian sebelum membuat pesanan baru.",
  expired: "Batas waktu pembayaran sudah lewat. Buat pesanan baru untuk melanjutkan.",
  refunded: "Penyedia telah mengonfirmasi pengembalian pembayaran ini.",
  unknown: "Kami sedang mencocokkan status dengan Tripay. Jangan buat pembayaran pengganti.",
};

export function PaymentInvoice({ id }: { id: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(true), [copied, setCopied] = useState(false);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true);
    try {
      const data = await paymentRequest<PaymentRecord>(`transactions/${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
      if (!controller.signal.aborted) { setPayment(data); setError(""); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Invoice belum dapat dimuat. Coba periksa kembali.");
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }, [id]);
  useEffect(() => {
    setPayment(null); setError(""); setCopied(false); void refresh();
    return () => { active.current?.abort(); active.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (payment?.invoiceNumber && id !== payment.invoiceNumber) router.replace(invoicePath(payment.id, payment.invoiceNumber), { scroll: false });
  }, [id, payment?.id, payment?.invoiceNumber, router]);
  useEffect(() => {
    if (!payment || ["failed", "expired", "refunded"].includes(payment.status) || payment.fulfillment?.status === "completed") return;
    const update = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(update, payment.status === "paid" ? 30000 : 15000);
    window.addEventListener("focus", update); window.addEventListener("pageshow", update); document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); };
  }, [payment?.status, payment?.fulfillment?.status, refresh]);

  const paid = payment?.status === "paid";
  const completed = paid && payment?.fulfillment?.status === "completed";
  const problem = !!payment && (payment.needsReview || ["unknown", "failed", "expired", "refunded"].includes(payment.status));
  const step = completed ? 4 : paid ? 3 : 2;
  const checkoutUrl = payment ? tripayCheckoutUrl(payment) : null;
  const fulfillmentLabels: Record<string, string> = { not_ready: "Menunggu pembayaran", ready: "Menunggu pemrosesan", processing: "Pesanan sedang diproses", completed: "Pesanan selesai", failed: "Pemrosesan perlu ditinjau", unknown: "Status pengiriman sedang diperiksa", manual_review: "Pesanan dalam tinjauan", dispatching: "Pesanan sedang dikirim" };

  async function copyNumber() {
    if (!payment?.invoiceNumber) return;
    try { await navigator.clipboard.writeText(payment.invoiceNumber); setCopied(true); }
    catch { setCopied(false); }
  }

  return <main id="main" className="container payment-invoice-page">
    <div className="invoice-toolbar"><Link href="/invoice"><ArrowLeft size={16} aria-hidden="true"/>Semua invoice</Link><span><ShieldCheck size={16} aria-hidden="true"/>Pembayaran melalui Tripay</span></div>
    <header className="invoice-page-heading"><h1>Invoice pesanan</h1><p>Simpan invoice ini untuk melihat pembayaran dan perkembangan pesananmu.</p></header>
    <ol className="invoice-steps" aria-label="Progres pesanan">
      {["Pesanan dibuat", "Pembayaran", "Diproses", "Selesai"].map((label, index) => <li key={label} data-state={index + 1 < step || completed ? "done" : index + 1 === step ? "current" : "next"} aria-current={index + 1 === step ? "step" : undefined}><span className="invoice-step-number" aria-hidden="true">{index + 1}</span><span>{label}</span></li>)}
    </ol>
    {error && <div className="invoice-notice" role="alert"><TriangleAlert size={20} aria-hidden="true"/><p>{error}{payment && " Status terakhir tetap ditampilkan."}</p></div>}
    {!payment ? <section className="invoice-loading" aria-busy={busy}><ReceiptText size={32} aria-hidden="true"/><h2>{busy ? "Memuat invoice..." : "Invoice belum dapat ditampilkan"}</h2><p>{busy ? "Kami sedang memeriksa rincian pesananmu." : "Periksa nomor invoice dan gunakan akun atau browser saat pesanan dibuat."}</p>{!busy && <Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button>}</section> : <>
      <article className="payment-ticket" aria-label="Rincian invoice">
        <div className="ticket-main">
          <header className="ticket-heading"><div className="ticket-brand"><ReceiptText size={23} aria-hidden="true"/><strong>Anres Store</strong></div><span className="ticket-type">Invoice pesanan</span></header>
          <div className="ticket-status" data-tone={problem ? "review" : paid ? "paid" : "pending"} role="status" aria-live="polite"><span className="ticket-status-icon" aria-hidden="true">{problem ? <TriangleAlert size={25}/> : paid ? <CircleCheck size={27}/> : <Clock3 size={26}/>}</span><div><h2>{payment.needsReview ? "Transaksi dalam tinjauan" : labels[payment.status] || "Memeriksa status"}</h2><p>{payment.needsReview ? "Tim kami perlu memeriksa transaksi ini. Jangan membuat pembayaran pengganti." : descriptions[payment.status]}</p></div></div>
          <section className="ticket-number"><div><h3>Nomor invoice</h3><p>{payment.invoiceNumber || "Nomor invoice sedang disiapkan"}</p></div><Button variant="outline" onClick={() => void copyNumber()} disabled={!payment.invoiceNumber} aria-label={copied ? "Nomor invoice disalin" : "Salin nomor invoice"}>{copied ? <Check size={16} aria-hidden="true"/> : <Copy size={16} aria-hidden="true"/>}{copied ? "Disalin" : "Salin"}</Button></section>
          <section className="ticket-order"><h3>Rincian pesanan</h3><h4>{payment.product}</h4><dl className="ticket-detail-grid"><div><dt>Tujuan / ID pelanggan</dt><dd>{payment.target || "—"}{payment.targetZone ? ` (${payment.targetZone})` : ""}</dd></div><div><dt>Dibuat pada</dt><dd>{date(payment.createdAt)}</dd></div><div><dt>Metode pembayaran</dt><dd>{payment.method}</dd></div>{payment.reference && <div><dt>Referensi Tripay</dt><dd>{payment.reference}</dd></div>}</dl></section>
          {payment.fulfillment && <section className="ticket-fulfillment"><h3>Pemrosesan pesanan</h3><p><span className="ticket-dot" aria-hidden="true"/>{fulfillmentLabels[payment.fulfillment.status] || "Status sedang diperiksa"}</p>{payment.fulfillment.note && <small>{payment.fulfillment.note}</small>}</section>}
          <footer className="ticket-footer"><span>Status diperiksa otomatis{payment.lastVerifiedAt ? ` · ${date(payment.lastVerifiedAt)}` : ""}</span><Link href="/bantuan">Butuh bantuan?</Link></footer>
        </div>
        <aside className="ticket-stub" aria-label="Ringkasan pembayaran"><div><h3>Ringkasan pembayaran</h3><dl className="ticket-totals"><div><dt>Harga produk</dt><dd>{money(payment.amount)}</dd></div><div><dt>Biaya admin</dt><dd>{payment.reference ? money(payment.fee) : "Menunggu Tripay"}</dd></div><div className="ticket-total"><dt>Total pembayaran</dt><dd>{payment.reference ? money(payment.total) : "Belum tersedia"}</dd></div></dl>
          {payment.status === "pending" && payment.expiresAt && <div className="ticket-expiry"><Clock3 size={17} aria-hidden="true"/><p>Bayar sebelum<strong>{date(payment.expiresAt * 1000)}</strong></p></div>}
          {checkoutUrl && payment.payCode && <div className="ticket-pay-code"><span>Kode bayar / virtual account</span><strong>{payment.payCode}</strong></div>}
          {checkoutUrl && <Button asChild className="ticket-pay-button"><a href={checkoutUrl} rel="noreferrer">Bayar di Tripay<ArrowUpRight size={17} aria-hidden="true"/></a></Button>}
          {payment.refreshDelayed && <p className="ticket-hint" role="status">Verifikasi Tripay sedang tertunda. Status terakhir tetap tersimpan.</p>}
          {["creating", "unknown"].includes(payment.status) && <p className="ticket-hint">Jangan buat pesanan baru. Periksa kembali status atau hubungi bantuan dengan nomor invoice ini.</p>}
          <Button variant="outline" className="ticket-refresh" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true"/>{busy ? "Memeriksa..." : "Periksa status"}</Button>
          <p className="ticket-verification"><ShieldCheck size={15} aria-hidden="true"/>Status pembayaran diverifikasi oleh server.</p>
        </div><div className="ticket-stub-bottom"><Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true"/>Cetak invoice</Button>{["paid", "failed", "expired", "refunded"].includes(payment.status) && <Link href="/katalog" onClick={() => { try { forgetPaymentIntent(payment.id); } catch { /* Next checkout remains guarded by the database. */ } }}>Kembali ke katalog</Link>}</div></aside>
      </article>
    </>}
  </main>;
}
