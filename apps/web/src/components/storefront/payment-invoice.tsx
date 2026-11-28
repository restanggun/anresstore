"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, CircleCheck, Clock3, Copy, Printer, ReceiptText, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@anres/ui";
import Link from "./domain-link";
import { invoiceSupportHref } from "@/lib/domains";
import { forgetPaymentIntent, paymentRequest } from "@/lib/payment-api";
import { invoicePath, tripayCheckoutUrl } from "@/lib/payment-navigation";
import { InvoiceRecovery } from "./invoice-recovery";
import { RefundRequest } from "./refund-request";
import { TaskOrderPanel } from "./task-order-panel";
import { InvoiceReviewForm } from "./product-reviews";
import { orderStatus } from "@/lib/order-status";
import { apiUrl } from "@/lib/auth-api";
import type { PaymentRecord } from "./payment-checkout";
import "./payment-invoice.css";

const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const date = (value: string | number) => `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB`;

export function PaymentInvoice({ id }: { id: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [adminView, setAdminView] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(true), [copied, setCopied] = useState(false);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true);
    try {
      let data: PaymentRecord;
      try {
        data = await paymentRequest<PaymentRecord>(`transactions/${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
        if (!controller.signal.aborted) setAdminView(false);
      } catch (ownerError) {
        const response = await fetch(`${apiUrl}/admin/invoices/${encodeURIComponent(id)}`, {
          credentials: "include", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (!response.ok) throw ownerError;
        data = await response.json() as PaymentRecord;
        if (!controller.signal.aborted) setAdminView(true);
      }
      if (!controller.signal.aborted) { setPayment(data); setError(""); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Invoice belum dapat dimuat. Coba periksa kembali.");
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }, [id]);
  useEffect(() => {
    setPayment(null); setError(""); setCopied(false); setAdminView(false); void refresh();
    return () => { active.current?.abort(); active.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (payment?.invoiceNumber && id !== payment.invoiceNumber) router.replace(invoicePath(payment.id, payment.invoiceNumber), { scroll: false });
  }, [id, payment?.id, payment?.invoiceNumber, router]);
  useEffect(() => {
    if (!payment || adminView || ["failed", "expired", "refunded"].includes(payment.status) || payment.fulfillment?.status === "completed") return;
    const update = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(update, payment.status === "paid" ? 30000 : 15000);
    window.addEventListener("focus", update); window.addEventListener("pageshow", update); document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); };
  }, [payment?.status, payment?.fulfillment?.status, adminView, refresh]);

  const status = payment ? orderStatus(payment) : null;
  const completed = status?.step === 4;
  const step = status?.step ?? 1;
  const checkoutUrl = payment ? tripayCheckoutUrl(payment) : null;
  const paymentHelpShown = payment?.manualPayment && payment.status === "pending" && !payment.manualProofSubmitted;
  const canStartNewOrder = !!payment && !adminView && !payment.needsReview &&
    !["requested", "in_review"].includes(payment.refund?.refund_status ?? "") &&
    (["failed", "expired", "refunded"].includes(payment.status) ||
      payment.status === "paid" && ["completed", "failed"].includes(payment.fulfillment?.status ?? ""));

  async function copyNumber() {
    if (!payment?.invoiceNumber) return;
    try { await navigator.clipboard.writeText(payment.invoiceNumber); setCopied(true); }
    catch { setCopied(false); }
  }

  return <main id="main" className="container payment-invoice-page">
    <div className="invoice-toolbar"><Link href="/invoice"><ArrowLeft size={16} aria-hidden="true"/>Semua invoice</Link><span><ShieldCheck size={16} aria-hidden="true"/>{adminView ? "Pemeriksaan admin · hanya-baca" : payment?.manualPayment ? "Pembayaran QRIS manual" : "Pembayaran melalui Tripay"}</span></div>
    <header className="invoice-page-heading"><h1>Invoice pesanan</h1><p>Pantau pembayaran, pengiriman produk, dan bantuan untuk pesananmu di sini.</p></header>
    <ol className="invoice-steps" aria-label="Progres pesanan">
      {["Pesanan dibuat", "Pembayaran", "Diproses", "Selesai"].map((label, index) => <li key={label} data-state={index + 1 === step && status?.needsHelp ? "problem" : index + 1 < step || completed ? "done" : index + 1 === step ? "current" : "next"} aria-current={index + 1 === step ? "step" : undefined}><span className="invoice-step-number" aria-hidden="true">{index + 1}</span><span>{index === 3 && payment?.refund?.refund_status === "completed" ? "Penanganan selesai" : index === 2 && payment?.status === "paid" && status?.needsHelp ? "Perlu penanganan" : label}</span></li>)}
    </ol>
    {error && <div className="invoice-notice" role="alert"><TriangleAlert size={20} aria-hidden="true"/><p>{error}{payment && " Status terakhir tetap ditampilkan."}</p></div>}
    {payment?.mode === "sandbox" && !payment.sandboxRealFulfillment && <p className="invoice-notice" role="status">Mode sandbox: pembayaran uji coba, tanpa pengiriman produk.</p>}
    {!payment ? <section className="invoice-loading" aria-busy={busy}><ReceiptText size={32} aria-hidden="true"/><h2>{busy ? "Memuat invoice..." : "Invoice belum dapat ditampilkan"}</h2><p>{busy ? "Kami sedang memeriksa rincian pesananmu." : "Periksa nomor invoice dan gunakan akun atau browser saat pesanan dibuat."}</p>{!busy && <Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button>}</section> : <>
      <article className="payment-ticket" aria-label="Rincian invoice">
        <div className="ticket-main">
          <header className="ticket-heading"><div className="ticket-brand"><ReceiptText size={23} aria-hidden="true"/><strong>Anres Store</strong></div><span className="ticket-type">Invoice pesanan</span></header>
          <section className="ticket-number"><div><h3>Nomor invoice</h3><p>{payment.invoiceNumber || "Nomor invoice sedang disiapkan"}</p></div><Button variant="outline" onClick={() => void copyNumber()} disabled={!payment.invoiceNumber} aria-label={copied ? "Nomor invoice disalin" : "Salin nomor invoice"}>{copied ? <Check size={16} aria-hidden="true"/> : <Copy size={16} aria-hidden="true"/>}{copied ? "Disalin" : "Salin"}</Button></section>
          <div className="ticket-status" data-tone={status!.tone} role="status" aria-live="polite"><span className="ticket-status-icon" aria-hidden="true">{status!.needsHelp ? <TriangleAlert size={25}/> : completed ? <CircleCheck size={27}/> : <Clock3 size={26}/>}</span><div><h2>{status!.title}</h2><p>{status!.description}</p></div></div>
          <dl className="ticket-state-pair"><div><dt>Pembayaran</dt><dd>{status!.paymentLabel}</dd></div><div data-problem={payment.status === "paid" && status!.needsHelp}><dt>Pengiriman produk</dt><dd>{status!.deliveryLabel}</dd></div></dl>
          <section className="ticket-order"><h3>Rincian pesanan</h3><h4>{payment.product}</h4><dl className="ticket-detail-grid"><div><dt>{payment.targetZone ? "ID pemain" : "Tujuan / ID pelanggan"}</dt><dd>{payment.target || "-"}</dd></div>{payment.targetZone && <div><dt>Server / zone</dt><dd>{payment.targetZone}</dd></div>}<div><dt>Dibuat pada</dt><dd>{date(payment.createdAt)}</dd></div><div><dt>Metode pembayaran</dt><dd>{payment.method}</dd></div>{payment.reference && <div><dt>Referensi Tripay</dt><dd>{payment.reference}</dd></div>}</dl></section>
          {status!.needsHelp && <section className="ticket-resolution" aria-label="Bantuan pesanan"><h3>{status!.reason ? "Alasan pengiriman gagal" : "Langkah berikutnya"}</h3>{status!.reason && <p>{status!.reason}</p>}<p>Tim CS dapat memeriksa kendala menggunakan invoice ini.</p><Button asChild variant="outline"><Link href={invoiceSupportHref(payment.invoiceNumber ?? payment.id)}>Hubungi CS</Link></Button></section>}
          {payment.fulfillment?.status === "completed" && payment.fulfillment.note && <section className="ticket-fulfillment"><h3>Informasi produk</h3><p>{payment.fulfillment.note}</p></section>}
          {!adminView && payment.source === "tasks" && !payment.manualPayment && payment.status === "paid" && <TaskOrderPanel id={payment.id}/>}
          {!adminView && payment.review?.eligible && <InvoiceReviewForm key={payment.id} invoiceId={payment.id} submitted={payment.review.submitted}/>}
          {!adminView && (payment.refund || payment.amount > 0 && payment.status === "paid" && status!.needsHelp) && <RefundRequest payment={payment} onUpdated={()=>void refresh()}/>}
          {!adminView && payment.ownership === "guest" && <div className="invoice-guest-notice"><span>Invoice ini masih mengikuti browser pemesan. Simpan ke akun untuk akses dari perangkat lain.</span><InvoiceRecovery invoiceNumber={payment.invoiceNumber||payment.id} label="Simpan ke akun"/></div>}
          <footer className="ticket-footer"><span>Status diperiksa otomatis{payment.lastVerifiedAt ? ` · ${date(payment.lastVerifiedAt)}` : ""}</span>{adminView || status!.needsHelp || paymentHelpShown ? <Link href="/bantuan">Pusat bantuan</Link> : <Link href={invoiceSupportHref(payment.invoiceNumber ?? payment.id)}>Hubungi CS</Link>}</footer>
        </div>
        <aside className="ticket-stub" aria-label="Ringkasan pembayaran"><div><h3>Ringkasan pembayaran</h3><dl className="ticket-totals"><div><dt>Harga produk</dt><dd>{money(payment.voucher?.baseAmount ?? payment.amount)}</dd></div>{payment.voucher && <div><dt>Voucher {payment.voucher.name}</dt><dd>−{money(payment.voucher.discount)}</dd></div>}<div><dt>Biaya admin</dt><dd>{payment.manualPayment || payment.reference || payment.amount === 0 ? money(payment.fee) : "Menunggu Tripay"}</dd></div><div className="ticket-total"><dt>Total pembayaran</dt><dd>{payment.manualPayment || payment.reference || payment.amount === 0 ? money(payment.total) : "Belum tersedia"}</dd></div></dl>
          {payment.status === "pending" && payment.expiresAt && <div className="ticket-expiry"><Clock3 size={17} aria-hidden="true"/><p>Bayar sebelum<strong>{date(payment.expiresAt * 1000)}</strong></p></div>}
          {payment.manualPayment && payment.status === "pending" && <div className="ticket-manual-payment">
            {payment.manualProofSubmitted ? <p role="status">Bukti transfer sedang diperiksa admin.</p> : <>
              {payment.manualQr && <img src={payment.manualQr} alt="Kode QRIS untuk membayar invoice ini" width={220} height={220} />}
              <p>{payment.manualQr ? "Pindai QRIS sesuai nominal dan kirim bukti transfer ke admin." : "Hubungi admin untuk instruksi pembayaran dan pengiriman bukti transfer."}</p>
              <Button asChild variant="outline"><Link href={invoiceSupportHref(payment.invoiceNumber ?? payment.id)}>Hubungi CS</Link></Button>
            </>}
          </div>}
          {checkoutUrl && payment.payCode && <div className="ticket-pay-code"><span>Kode bayar / virtual account</span><strong>{payment.payCode}</strong></div>}
          {checkoutUrl && <Button asChild className="ticket-pay-button"><a href={checkoutUrl} rel="noreferrer">Bayar di Tripay<ArrowUpRight size={17} aria-hidden="true"/></a></Button>}
          {payment.refreshDelayed && <p className="ticket-hint" role="status">Verifikasi Tripay sedang tertunda. Status terakhir tetap tersimpan.</p>}
          {["creating", "unknown"].includes(payment.status) && <p className="ticket-hint">Jangan buat pesanan baru. Periksa kembali status atau hubungi bantuan dengan nomor invoice ini.</p>}
          <Button variant="outline" className="ticket-refresh" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true"/>{busy ? "Memeriksa..." : "Periksa status"}</Button>
          <p className="ticket-verification"><ShieldCheck size={15} aria-hidden="true"/>Status pembayaran diverifikasi oleh server.</p>
        </div><div className="ticket-stub-bottom"><Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true"/>Simpan PDF / cetak</Button><small className="ticket-pdf-hint">Pilih Simpan sebagai PDF pada jendela cetak untuk mengunduh salinan invoice.</small>{["paid", "failed", "expired", "refunded"].includes(payment.status) && <Link href="/katalog" onClick={() => { if (!canStartNewOrder) return; try { forgetPaymentIntent(payment.id); } catch { /* Next checkout remains guarded by the database. */ } }}>Kembali ke katalog</Link>}</div></aside>
      </article>
    </>}
  </main>;
}
