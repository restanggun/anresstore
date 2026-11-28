"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { domains } from "@/lib/domains";
import { paymentRequest, submitPayment } from "@/lib/payment-api";
import { resellerRequest, ResellerRequestError, resellerRupiah, type ResellerSnapshot } from "@/lib/reseller-api";
import Link from "./domain-link";
import styles from "./reseller-dashboard.module.css";

type Product = { code: string; name: string; retailPrice: number; amount: number; requiresZone: boolean };
type Channel = { code: string; name: string; minimum: number; maximum: number };
type Order = { payment_id: string; invoice_number: string; product_name: string; amount: number; payment_status: string; fulfillment_status: string; channel: string };
type Key = { id: string; label: string };
type HostedProduct = Product & { category: string; shopName: string };
type HostedOrder = { id: string; code: string; invoice_number: string | null; state: string; earned: number | null; payout_amount: number | null };
const labels: Record<string, string> = {
  creating: "Sedang dibuat", pending: "Menunggu pembayaran", paid: "Lunas", failed: "Gagal", expired: "Kedaluwarsa", refunded: "Dikembalikan",
  not_ready: "Belum diproses", ready: "Dalam antrean", dispatching: "Mengirim", processing: "Diproses", completed: "Selesai",
  unknown: "Perlu diperiksa", manual_review: "Ditinjau",
};
const appUrl = (path: string) => new URL(path, domains.app).href;
const checkoutUrl = (id: string) => appUrl(`/checkout-reseller/${id}`);

export function ResellerDashboard() {
  const [data, setData] = useState<ResellerSnapshot | null>(null);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [applying, setApplying] = useState(false);
  const [linkRevision, setLinkRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<ResellerSnapshot>("me", undefined, controller.signal).then(setData).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ResellerRequestError && cause.status === 401) setSignIn(true);
      else setError(cause instanceof ResellerRequestError ? cause.message : "Status reseller belum dapat dimuat.");
    });
    return () => controller.abort();
  }, []);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setApplying(true);
    setError("");
    try {
      await resellerRequest("applications", { shopName: form.get("shopName"), whatsapp: form.get("whatsapp") });
      setData(await resellerRequest<ResellerSnapshot>("me"));
    } catch (cause) { setError(cause instanceof ResellerRequestError ? cause.message : "Periksa status pengajuan sebelum mencoba lagi."); }
    finally { setApplying(false); }
  }

  const member = data?.member;
  return <main id="main" className={`container account-page ${styles.page}`}>
    <Link href="/dashboard" className="text-link">Dashboard saya</Link>
    <section className="account-hero">
      <div><h1>{member?.status === "approved" ? "Dashboard reseller" : "Program reseller"}</h1>
        <p>{member?.shop_name || "Ajukan pendaftaran dan pantau statusnya di sini."}</p></div>
      <aside><Link href="/reseller">Tentang program reseller</Link></aside>
    </section>
    {error && <p role="alert">{error}</p>}
    {signIn && <p><Link className="text-link" href="/login?returnTo=reseller">Masuk untuk melanjutkan</Link></p>}
    {!data && !error && !signIn && <p role="status">Memuat status reseller...</p>}
    {member?.status === "pending" && <p role="status">Pengajuanmu menunggu tinjauan admin.</p>}
    {member?.status === "rejected" && <p role="status">Pengajuan sebelumnya ditolak. Kamu bisa mengajukan ulang saat pendaftaran dibuka.</p>}
    {member?.status === "suspended" && <p role="status">Akses reseller ditangguhkan. Hubungi tim Anres jika perlu bantuan.</p>}
    {data && (!member || member.status === "rejected") && (data.registrationOpen
      ? <section className={styles.panel}>
          <h2>Ajukan pendaftaran</h2>
          <form method="post" className={styles.form} onSubmit={apply}>
            <label htmlFor="reseller-shop">Nama toko (wajib)</label>
            <Input id="reseller-shop" name="shopName" autoComplete="organization" minLength={2} maxLength={80} required defaultValue={member?.shop_name}/>
            <label htmlFor="reseller-whatsapp">Nomor WhatsApp (wajib)</label>
            <Input id="reseller-whatsapp" name="whatsapp" type="tel" autoComplete="tel" minLength={8} maxLength={25} required/>
            <Button type="submit" disabled={applying}>{applying ? "Mengirim pengajuan..." : "Kirim pengajuan"}</Button>
          </form>
        </section>
      : <p>Pendaftaran reseller sedang ditutup.</p>)}
    {data && member?.status === "approved" && <>
      <section className={styles.panel}>
        <h2>{data.progress.activated ? `Level ${data.progress.tier}` : "Aktifkan akses reseller"}</h2>
        <p>{data.progress.activated
          ? `${resellerRupiah(data.progress.volume)} transaksi reseller dalam 90 hari terakhir.`
          : `${resellerRupiah(data.progress.activationSpend)} dari Rp100.000 untuk aktivasi. Setiap pesanan reseller yang dibayar dan selesai menambah progres sebelum biaya pembayaran.`}</p>
        <Link className="text-link" href="/misi#permanen">Lihat Misi Permanen</Link>
      </section>
      <ResellerOrderForm onLinkCreated={data.progress.activated && data.hostedEnabled ? () => setLinkRevision(value => value + 1) : undefined}/>
      <ResellerOrders />
      {data.progress.activated && <ResellerCheckoutLinks key={linkRevision}/>}
      {data.progress.activated && <ResellerKeys />}
    </>}
    {member?.status === "suspended" && <ResellerOrders />}
  </main>;
}

export function ResellerHostedCheckout({ id }: { id: string }) {
  const [product, setProduct] = useState<HostedProduct | null>(null);
  const [error, setError] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const key = `anres-reseller-checkout:${id}`;
  useEffect(() => {
    const controller = new AbortController();
    setInvoiceId(sessionStorage.getItem(key));
    resellerRequest<Omit<HostedProduct, "retailPrice">>(`checkout/${id}`, undefined, controller.signal)
      .then(item => setProduct({ ...item, retailPrice: item.amount }))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof ResellerRequestError ? cause.message : "Link checkout belum dapat dimuat."); });
    return () => controller.abort();
  }, [id, key]);
  return <main id="main" className={`container account-page ${styles.page}`}>
    <section className={styles.panel}>
      <h1>Checkout reseller</h1>
      {product && <p>Pesanan untuk {product.shopName}. Anres Store menerima pembayaran dan memproses produk.</p>}
      {error && <p role="alert">{error}</p>}
      {!product && !error && <p role="status">Memuat checkout...</p>}
      {invoiceId && /^[a-f0-9-]{36}$/.test(invoiceId) && <Link href={`/invoice/${invoiceId}`} className="text-link">Periksa invoice dari percobaan terakhir</Link>}
    </section>
    {product && <ResellerOrderForm hosted={{ id, product }} onReserved={paymentId => {
      sessionStorage.setItem(key, paymentId); setInvoiceId(paymentId);
    }}/>}
  </main>;
}

function ResellerOrderForm({ hosted, onLinkCreated, onReserved }: {
  hosted?: { id: string; product: HostedProduct };
  onLinkCreated?: () => void;
  onReserved?: (id: string) => void;
}) {
  const hostedProduct = hosted?.product;
  const [category, setCategory] = useState(hostedProduct?.category ?? "game");
  const [products, setProducts] = useState<Product[]>([]);
  const [code, setCode] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const selected = hostedProduct ?? products.find(item => item.code === code);
  const availableChannels = selected ? channels.filter(channel => selected.amount >= channel.minimum && selected.amount <= channel.maximum) : [];
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      hostedProduct ? Promise.resolve({ items: [hostedProduct] }) : resellerRequest<{ items: Product[] }>(`catalog?category=${category}`, undefined, controller.signal),
      paymentRequest<{ channels: Channel[]; mode: string }>("channels", { signal: controller.signal }),
    ]).then(([catalog, gateway]) => {
      if (controller.signal.aborted) return;
      setProducts(catalog.items);
      setChannels(gateway.mode === "live" ? gateway.channels : []);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, hostedProduct]);

  async function order(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const payment = await submitPayment<{ id: string; invoiceNumber: string | null }>({
        source: category, code: selected.code, expectedAmount: selected.amount, target: form.get("target"),
        ...(selected.requiresZone ? { targetZone: form.get("targetZone") } : {}),
        name: form.get("name"), email: form.get("email"), phone: form.get("phone"), method: form.get("method"),
      }, onReserved ?? (() => {}), hosted ? `reseller-checkout/${hosted.id}` : "reseller-transactions");
      window.location.assign(appUrl(`/invoice/${encodeURIComponent(payment.invoiceNumber ?? payment.id)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Periksa riwayat sebelum mencoba lagi.");
      setBusy(false);
    }
  }

  async function createLink() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setLink("");
    try {
      const created = await resellerRequest<{ id: string }>("checkout-links", { category, code: selected.code });
      setLink(checkoutUrl(created.id));
      onLinkCreated?.();
    } catch (cause) {
      setError(cause instanceof ResellerRequestError ? cause.message : "Periksa daftar link sebelum mencoba lagi.");
    } finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>{hosted ? hosted.product.name : "Buat pesanan untuk pelanggan"}</h2>
    <form method="post" onSubmit={order} className={styles.form}>
      {!hosted && <><label htmlFor="reseller-category">Kategori</label>
      <select id="reseller-category" value={category} disabled={busy} onChange={event => {
        setCategory(event.target.value); setCode(""); setProducts([]); setError(""); setLink(""); setLoading(true);
      }}><option value="game">Top up game</option><option value="prepaid">Prabayar</option></select></>}
      {loading && <p role="status">Memuat produk dan pembayaran...</p>}
      {!loading && !products.length && !error && <p>Belum ada produk yang memenuhi syarat di kategori ini.</p>}
      {!hosted && !!products.length && <>
        <label htmlFor="reseller-product">Produk</label>
        <select id="reseller-product" name="code" value={code} required disabled={busy} onChange={event => setCode(event.target.value)}>
          <option value="">Pilih produk</option>
          {products.map(item => <option key={item.code} value={item.code}>{item.name} — {resellerRupiah(item.amount)}</option>)}
        </select>
      </>}
      {selected && <>
        <p>{hosted ? `Harga ${resellerRupiah(selected.amount)} sebelum biaya pembayaran.` : `Harga publik ${resellerRupiah(selected.retailPrice)}. Harga reseller ${resellerRupiah(selected.amount)} sebelum biaya pembayaran.`}</p>
        {onLinkCreated && <Button type="button" variant="outline" disabled={busy} onClick={() => void createLink()}>Buat link agar pelanggan bisa bayar</Button>}
        {link && <><label htmlFor="reseller-shared-checkout">Link checkout pelanggan (sekali pakai)</label><Input id="reseller-shared-checkout" value={link} readOnly onFocus={event => event.currentTarget.select()}/></>}
        <label htmlFor="reseller-target">{category === "game" ? "ID pemain" : "Nomor / ID tujuan"}</label>
        <Input id="reseller-target" name="target" maxLength={200} required/>
        {selected.requiresZone && <><label htmlFor="reseller-zone">Server / zone pemain</label><Input id="reseller-zone" name="targetZone" inputMode="numeric" pattern="[0-9]+" required/></>}
        <label htmlFor="reseller-name">Nama penagihan</label>
        <Input id="reseller-name" name="name" autoComplete="name" maxLength={100} required/>
        <label htmlFor="reseller-email">Email penagihan</label>
        <Input id="reseller-email" name="email" type="email" autoComplete="email" maxLength={254} required/>
        <label htmlFor="reseller-phone">Nomor HP penagihan</label>
        <Input id="reseller-phone" name="phone" type="tel" autoComplete="tel" pattern={"\\+?[0-9]{8,15}"} required/>
        <label htmlFor="reseller-method">Metode pembayaran</label>
        <select id="reseller-method" name="method" required><option value="">Pilih pembayaran</option>
          {availableChannels.map(channel => <option key={channel.code} value={channel.code}>{channel.name}</option>)}
        </select>
        {!availableChannels.length && <p>Belum ada metode pembayaran untuk nominal ini.</p>}
        <Button type="submit" disabled={busy || !availableChannels.length}>{busy ? "Menyiapkan invoice..." : `Buat invoice ${resellerRupiah(selected.amount)}`}</Button>
      </>}
      {error && <p role="alert">{error}</p>}
    </form>
  </section>;
}

function ResellerCheckoutLinks() {
  const [rows, setRows] = useState<HostedOrder[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<{ rows: HostedOrder[] }>("checkout-links", undefined, controller.signal)
      .then(data => setRows(data.rows)).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  const status: Record<string, string> = {
    open: "Siap dipakai", expired: "Kedaluwarsa", pending: "Menunggu pembayaran atau pengiriman", holding: "Masa tunggu",
    payable: "Siap dicairkan", paid_out: "Dicairkan", void: "Komisi batal", adjustment: "Perlu penyesuaian refund", reconciled: "Penyesuaian selesai",
  };
  return <section className={styles.panel}>
    <h2>Link checkout dan komisi</h2>
    <p>Link berlaku tujuh hari dan hanya untuk satu pesanan. Komisi yang memenuhi syarat masuk masa tunggu 14 hari setelah produk dikirim.</p>
    {error ? <p role="alert">Link checkout belum dapat dimuat.</p> : !rows ? <p role="status">Memuat link checkout...</p> : !rows.length ? <p>Belum ada link checkout.</p>
      : <ul className={styles.list}>{rows.map(row => <li key={row.id}>
        <strong>{row.code}</strong><p>{status[row.state] ?? row.state}{row.invoice_number ? ` · ${row.invoice_number}` : ""}</p>
        {row.state === "open" && <p><a className="text-link" href={checkoutUrl(row.id)}>Buka link checkout pelanggan</a></p>}
        {row.earned !== null && <p>Komisi {resellerRupiah(row.earned)}{row.payout_amount ? ` · Dicairkan ${resellerRupiah(row.payout_amount)}` : ""}</p>}
      </li>)}</ul>}
  </section>;
}

function ResellerOrders() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Order[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<Order[]>(`orders?page=${page}`, undefined, controller.signal).then(setRows)
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [page]);
  const go = (next: number) => { setRows(null); setError(false); setPage(next); };
  return <section className={styles.panel}>
    <h2>Riwayat pesanan reseller</h2>
    {error ? <p role="alert">Riwayat pesanan belum dapat dimuat.</p> : !rows ? <p role="status">Memuat pesanan...</p> : !rows.length ? <p>Belum ada pesanan di halaman ini.</p>
      : <ul className={styles.list}>{rows.map(row => <li key={row.payment_id}>
          <Link className="text-link" href={`/invoice/${row.invoice_number || row.payment_id}`}>{row.product_name}</Link>
          <p>{row.invoice_number} · {resellerRupiah(row.amount)} · {row.channel === "api" ? "API" : "Dashboard"}</p>
          <p>Pembayaran {labels[row.payment_status] ?? row.payment_status} · Produk {labels[row.fulfillment_status] ?? row.fulfillment_status}</p>
        </li>)}</ul>}
    <div className={styles.actions}>
      <Button variant="outline" type="button" disabled={page === 0} onClick={() => go(page - 1)}>Sebelumnya</Button>
      <Button variant="outline" type="button" disabled={!rows || rows.length < 25} onClick={() => go(page + 1)}>Berikutnya</Button>
    </div>
  </section>;
}

function ResellerKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<Key[]>("keys", undefined, controller.signal).then(setKeys).catch(() => {
      if (!controller.signal.aborted) setError("Daftar API key belum dapat dimuat.");
    });
    return () => controller.abort();
  }, []);
  async function change(path: string, body: unknown) {
    setBusy(true);
    setSecret("");
    setError("");
    try {
      const key = await resellerRequest<Key & { secret?: string }>(path, body);
      if (key.secret) setSecret(key.secret);
      setKeys(await resellerRequest<Key[]>("keys"));
    } catch (cause) { setError(cause instanceof ResellerRequestError ? cause.message : "Status API key belum dapat dipastikan. Muat ulang halaman."); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>API key</h2>
    <p>Gunakan API key di server tokomu. Untuk rotasi, buat key baru, pindahkan integrasi, lalu cabut key lama.</p>
    <details>
      <summary>Endpoint API reseller</summary>
      <p>Kirim key dalam header <code>Authorization: Bearer</code>. Gunakan ID yang sama saat mengulang permintaan pesanan.</p>
      <ul className={styles.list}>
        <li><code>GET /v1/reseller/catalog</code> dengan <code>category=game</code> atau <code>category=prepaid</code></li>
        <li><code>POST /v1/payments/reseller-transactions</code> untuk membuat invoice</li>
        <li><code>GET /v1/reseller/orders/&#123;id&#125;</code> untuk memeriksa status</li>
      </ul>
    </details>
    <form method="post" className={styles.form} onSubmit={event => {
      event.preventDefault();
      void change("keys", { label: new FormData(event.currentTarget).get("label") });
    }}>
      <label htmlFor="reseller-key-label">Nama key</label>
      <Input id="reseller-key-label" name="label" maxLength={60} required/>
      <Button type="submit" disabled={busy}>Buat API key</Button>
    </form>
    {secret && <div className={styles.form}><p role="status">API key dibuat. Salin sekarang karena key hanya tampil sekali.</p>
      <label htmlFor="reseller-secret">API key baru</label><Input id="reseller-secret" value={secret} readOnly onFocus={event => event.currentTarget.select()}/></div>}
    {error && <p role="alert">{error}</p>}
    {keys && <ul className={styles.list}>{keys.map(key => <li key={key.id}>
      <strong>{key.label}</strong> <Button type="button" variant="outline" disabled={busy} onClick={() => void change(`keys/${key.id}/revoke`, {})}>Cabut key {key.label}</Button>
    </li>)}</ul>}
  </section>;
}
