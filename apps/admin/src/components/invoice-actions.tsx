"use client";

import { AdminDrawer } from "./admin-drawer";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileImage, Pencil, RotateCcw, Share2, Trash2, X } from "lucide-react";
import { AdminInput, AdminTextarea } from "./form-controls";
import { CustomSelect } from "./custom-select";
import { adminRequest, stateLabel } from "./workspace-api";

const storefront = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "");

type InvoiceOrder = {
  id: string; invoice_number: string | null; product_name: string; target: string; target_zone: string | null;
  amount: number; customer_name?: string; customer_email?: string; customer_phone?: string;
};
type Management = {
  version: string; premium: boolean; canEditAmount: boolean; canEditTarget: boolean;
  canUpload: boolean; hasProof: boolean; canRestore: boolean; canShare: boolean;
  reviewed: boolean; paymentOptions: string[]; canArchive: boolean;
};
type InvoiceAction = "edit" | "proof" | "status" | "restore" | "archive" | "share";
type RunAction = (action: InvoiceAction, data?: Record<string, unknown>) => Promise<void>;

const statusName = (status: string) =>
  ({ delivered: "Data akses dikirim", closed: "Tutup pesanan", refunded: "Dana sudah dikembalikan", failed: "Gagal / batal" })[status] ?? stateLabel(status);

function FieldForm({ order, options, busy, onSave }: {
  order?: InvoiceOrder; options?: Management; busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [category, setCategory] = useState("game");
  const amountEnabled = !order || options?.canEditAmount;
  const targetEnabled = !order || options?.canEditTarget;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), get = (name: string) => String(form.get(name) ?? "");
    const body: Record<string, unknown> = { productName: get("productName"), name: get("name"), email: get("email"), phone: get("phone") };
    if (!order) Object.assign(body, { category: get("category"), productSlug: get("productSlug") });
    if (amountEnabled && (!order || Number(get("amount")) !== Number(order.amount))) body.amount = Number(get("amount"));
    if (targetEnabled && (!order || get("target") !== order.target || get("targetZone") !== (order.target_zone ?? "")))
      Object.assign(body, { target: get("target"), targetZone: get("targetZone") });
    onSave(body);
  }
  return <form className="variant-form invoice-admin-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      {!order && <div className="form-two-columns">
        <label>Kategori<CustomSelect name="category" value={category} onChange={event => setCategory(event.target.value)} aria-label="Kategori">
          <option value="game">Top up game</option><option value="prepaid">PPOB</option>
          <option value="apps">App premium</option><option value="social">Sosmed</option><option value="tasks">Joki tugas</option>
        </CustomSelect></label>
        <label>Slug produk untuk rating<AdminInput name="productSlug" maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="mobile-legends" /></label>
      </div>}
      <label>Nama produk<AdminInput name="productName" required defaultValue={order?.product_name} maxLength={180} /></label>
      <div className="form-two-columns">
        <label>Nama pelanggan<AdminInput name="name" autoComplete="name" defaultValue={order?.customer_name} maxLength={100} /></label>
        <label>Email pelanggan<AdminInput name="email" type="email" autoComplete="email" required={!order} defaultValue={order?.customer_email} maxLength={254} /></label>
        <label>Nomor WhatsApp<AdminInput name="phone" type="tel" autoComplete="tel" defaultValue={order?.customer_phone} maxLength={16} /></label>
        <label>Nominal (Rp)<AdminInput name="amount" type="number" inputMode="numeric" min={1} max={100000000} required
          readOnly={!amountEnabled} defaultValue={order?.amount} /></label>
      </div>
      {targetEnabled && <div className="form-two-columns">
        <label>Tujuan layanan<AdminInput name="target" required defaultValue={order?.target} maxLength={1000} /></label>
        <label>Server / zona<AdminInput name="targetZone" defaultValue={order?.target_zone ?? undefined} maxLength={80} /></label>
      </div>}
      <button type="submit" className="primary-button">{busy ? "Menyimpan…" : order ? "Simpan perubahan" : "Buat transaksi"}</button>
    </fieldset>
  </form>;
}

export async function refreshInvoices(client: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    "order-records", "invoice-management", "analytics", "premium-orders", "premium-order", "task-orders", "admin-work-notifications",
  ].map(key => client.invalidateQueries({ queryKey: [key] })));
}

export function CreateInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (invoiceNumber: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useRef<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const client = useQueryClient();
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  async function save(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      id.current ??= crypto.randomUUID();
      const result = await adminRequest(`invoice-management/${id.current}/create`, "POST", body);
      await refreshInvoices(client);
      onCreated(result.invoiceNumber);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <AdminDrawer ref={ref} className="order-dialog" aria-labelledby="create-invoice-title" onClose={onClose} dismissDisabled={busy}>
    <header className="drawer-header"><h2 id="create-invoice-title">Buat transaksi baru</h2>
      <button type="button" className="square-button" aria-label="Tutup pembuatan transaksi" disabled={busy} onClick={() => ref.current?.close()}><X size={20} /></button>
    </header>
    <div className="drawer-content">
      <p>Transaksi dibuat dengan pembayaran QRIS manual dan langsung masuk ke daftar invoice.</p>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      <FieldForm busy={busy} onSave={body => void save(body)} />
    </div>
  </AdminDrawer>;
}

function ProofForm({ busy, run }: { busy: boolean; run: RunAction }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("proof");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
      setError("Pilih gambar bukti transfer maksimal 10 MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onerror = () => setError("File bukti transfer belum dapat dibaca.");
    reader.onload = () => void run("proof", { image: reader.result, note: data.get("note") });
    reader.readAsDataURL(file);
  }
  return <form className="variant-form invoice-admin-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <label>Bukti transfer<AdminInput name="proof" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
      <small>PNG, JPEG, atau WebP. Maksimal 10 MB.</small>
      <label>Catatan bukti<AdminTextarea name="note" maxLength={500} rows={2} /></label>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      <button type="submit" className="primary-button">{busy ? "Mengunggah…" : "Simpan bukti transfer"}</button>
    </fieldset>
  </form>;
}

export function InvoiceActions({ order, onArchive }: { order: InvoiceOrder; onArchive: () => void }) {
  const [panel, setPanel] = useState<"edit" | "proof" | "archive" | "restore" | null>(null);
  const [editVersion, setEditVersion] = useState("");
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [error, setError] = useState("");
  const [link, setLink] = useState(""), [showProof, setShowProof] = useState(false);
  const [status, setStatus] = useState("");
  const client = useQueryClient();
  const path = `invoice-management/${order.id}`;
  const query = useQuery({ queryKey: ["invoice-management", order.id], queryFn: () => adminRequest(path) as Promise<Management>, retry: false });
  const proof = useQuery({ queryKey: ["invoice-management", order.id, "proof"],
    queryFn: () => adminRequest(path + "/proof") as Promise<{ image: string | null; note: string | null }>, enabled: showProof });
  const options = query.data;

  async function run(action: InvoiceAction, data: Record<string, unknown> = {}) {
    if (busy || !options) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const result = await adminRequest(`${path}/${action}`, "POST", { ...data, version: action === "edit" ? editVersion : options.version });
      if (action === "share") {
        setPanel(null);
        setLink(`${storefront}/rating#${result.token}`);
        setFeedback("Tautan rating siap dibagikan dan berlaku selama 30 hari.");
        return;
      }
      if (action === "archive") onArchive();
      else {
        setPanel(null);
        setStatus("");
        setFeedback(action === "restore" ? "Invoice dipulihkan." : action === "proof" ? "Bukti transfer tersimpan." : "Perubahan invoice tersimpan.");
      }
      await refreshInvoices(client);
    } catch (reason) {
      setError((reason as Error).message);
      void query.refetch();
    } finally { setBusy(false); }
  }

  function select(next: typeof panel) {
    if (next === "edit" && panel !== "edit") setEditVersion(options?.version ?? "");
    setPanel(panel === next ? null : next);
    setError("");
    setFeedback("");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setFeedback("Tautan rating disalin.");
    } catch { setFeedback("Pilih tautan untuk menyalinnya secara manual."); }
  }

  const number = (order.customer_phone ?? "").replace(/\D/g, "").replace(/^0/, "62");
  const whatsapp = `https://wa.me/${/^\d{8,15}$/.test(number) ? number : ""}?text=${encodeURIComponent(`Halo! Beri rating untuk pesanan ${order.invoice_number ?? ""} di Anres Store melalui tautan ini: ${link}`)}`;

  return <section className="detail-section invoice-admin-actions" aria-labelledby="invoice-management-title">
    <h3 id="invoice-management-title">Kelola invoice</h3>
    {query.isPending && <p role="status">Memuat aksi invoice…</p>}
    {query.error && <div className="workspace-error" role="alert">{query.error.message}
      <button type="button" className="outline-button" onClick={() => void query.refetch()}>Coba lagi</button></div>}
    {options && <>
      <div className="heading-actions invoice-action-row">
        <button type="button" className="outline-button" disabled={busy} aria-expanded={panel === "edit"} onClick={() => select("edit")}><Pencil size={15} aria-hidden="true" />Edit invoice</button>
        {options.canUpload && <button type="button" className="outline-button" disabled={busy} aria-expanded={panel === "proof"} onClick={() => select("proof")}><FileImage size={15} aria-hidden="true" />Unggah bukti transfer</button>}
        {options.canRestore && <button type="button" className="outline-button" disabled={busy} aria-expanded={panel === "restore"} onClick={() => select("restore")}><RotateCcw size={15} aria-hidden="true" />Pulihkan invoice</button>}
        <button type="button" className="outline-button" disabled={busy || !options.canShare} onClick={() => void run("share")}><Share2 size={15} aria-hidden="true" />Bagikan rating</button>
        <button type="button" className="outline-button invoice-archive-button" disabled={busy || !options.canArchive} aria-expanded={panel === "archive"} onClick={() => select("archive")}><Trash2 size={15} aria-hidden="true" />Hapus pesanan</button>
      </div>
      {!options.canShare && <p className="field-note">{options.reviewed ? "Pelanggan sudah mengirim ulasan." : "Tautan rating tersedia untuk pesanan lunas dan selesai yang terhubung ke produk katalog."}</p>}
      {!options.canArchive && <p className="field-note">Selesaikan atau batalkan pesanan sebelum menghapusnya.</p>}
      {error && <p role="alert" className="workspace-error">{error}</p>}
      {feedback && <p role="status" className="workspace-feedback">{feedback}</p>}
      {link && <div className="variant-form invoice-admin-share">
        <label>Tautan rating<AdminInput readOnly value={link} onFocus={event => event.currentTarget.select()} /></label>
        <div className="heading-actions invoice-action-row">
          <button type="button" className="outline-button" onClick={() => void copyLink()}><Copy size={15} aria-hidden="true" />Salin tautan</button>
          <a className="primary-button" href={whatsapp} target="_blank" rel="noopener noreferrer">Bagikan via WhatsApp</a>
        </div>
      </div>}
      {panel === "edit" && <FieldForm order={order} options={options} busy={busy} onSave={body => void run("edit", body)} />}
      {panel === "proof" && <ProofForm busy={busy} run={run} />}
      {panel === "archive" && <div className="invoice-admin-confirm">
        <p>Hapus {order.invoice_number} dari daftar pesanan dan riwayat pelanggan? Catatan pembayaran tetap disimpan untuk audit.</p>
        <button type="button" className="outline-button invoice-archive-button" disabled={busy} onClick={() => void run("archive", { confirm: true })}>Ya, hapus pesanan</button>
        <button type="button" className="outline-button" disabled={busy} onClick={() => select(null)}>Kembali</button>
      </div>}
      {panel === "restore" && <div className="invoice-admin-confirm">
        <p>{options.premium ? "Buka kembali pembayaran premium selama satu jam." : "Kembalikan transaksi ke status menunggu pembayaran."}</p>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run("restore", { confirm: true })}>Ya, pulihkan invoice</button>
        <button type="button" className="outline-button" disabled={busy} onClick={() => select(null)}>Kembali</button>
      </div>}
      {options.paymentOptions.length > 0 && <form className="variant-form invoice-admin-form" aria-label="Ubah status invoice" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void run("status", { field: "payment", status: data.get("status") });
      }}>
        <fieldset disabled={busy} key={options.paymentOptions.join(",")}>
          <label>{options.premium ? "Status pesanan premium" : "Status pembayaran manual"}
            <CustomSelect aria-label="Status invoice" name="status" required value={options.paymentOptions.includes(status) ? status : ""} onChange={event => setStatus(event.target.value)}>
              <option value="" disabled>Pilih status</option>
              {options.paymentOptions.map(status => <option key={status} value={status}>{statusName(status)}</option>)}
            </CustomSelect>
          </label>
          <button type="submit" className="primary-button" disabled={!options.paymentOptions.includes(status)}>Simpan status</button>
        </fieldset>
      </form>}
      {options.hasProof && <div>
        <button type="button" className="outline-button" aria-expanded={showProof} onClick={() => setShowProof(value => !value)}>{showProof ? "Sembunyikan bukti" : "Lihat bukti transfer"}</button>
        {showProof && (proof.error ? <p role="alert">{proof.error.message}</p> : proof.isPending ? <p role="status">Memuat bukti…</p> :
          proof.data?.image && <figure className="invoice-proof"><img src={proof.data.image} alt="Bukti transfer pelanggan" />
            {proof.data.note && <figcaption>{proof.data.note}</figcaption>}</figure>)}
      </div>}
    </>}
  </section>;
}
