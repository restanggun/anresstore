"use client";
import { CustomSelect } from "./custom-select";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FulfillmentRecords } from "./fulfillment-records";
import { AccessManager } from "./access-manager";

const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
const web = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "");
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${api}/admin/${path}`, { method, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "Data gagal dimuat. Coba lagi.");
  return data;
}
type Row = Record<string, any>;
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(value).toLocaleString("id-ID");
const status: Record<string, string> = { creating: "Membuat pembayaran", pending: "Menunggu pembayaran", paid: "Lunas (sandbox)", failed: "Gagal", expired: "Kedaluwarsa", refunded: "Dikembalikan", unknown: "Perlu diperiksa", awaiting_payment: "Menunggu pembayaran simulasi", new: "Baru", in_progress: "Ditangani", closed: "Selesai" };
const blank = () => ({ id: "", provider: "manual", provider_code: "", category: "game", product: "", product_slug: "", name: "", price: 0, description: "", active: false });
const features = [
  ["Katalog game, PPOB, aplikasi", "/katalog", "Terhubung", "Produk aktif dan perubahan katalog admin memakai endpoint yang sama dengan web dan checkout. Publikasi memerlukan ADMIN_CATALOG_ENABLED."],
  ["Pesanan dan invoice akun", "/invoice", "Simulasi", "Tersimpan di database orders. Nilai pesanan simulasi bukan pendapatan terverifikasi."],
  ["Pembayaran Tripay", "/katalog", "Sandbox", "Tercatat di sandbox_payments. Status mengikuti verifikasi Tripay; dashboard tidak mengubah status pembayaran."],
  ["Provider lain / produk manual", "/katalog", "Katalog tersedia", "Identitas provider dan kode produk bebas diatur. Sinkronisasi API dan pengiriman otomatis provider baru belum tersedia di web."],
  ["Permintaan bantuan", "/bantuan", "Terhubung", "Permintaan web dapat dibaca dan ditandai ditangani/selesai. Percakapan serta balasan CS belum tersedia di web."],
  ["Format tugas dan booster", "/katalog", "Belum tersedia di web", "Belum ada alur transaksi lengkap; produk kategori ini belum dapat diterbitkan dari dashboard."],
  ["Pembayaran produksi dan pengiriman", "/katalog", "Belum tersedia di web", "Belum ada transaksi uang nyata atau pengiriman otomatis. Lunas sandbox tidak berarti produk telah dikirim."],
  ["Flash sale", "/katalog", "Terhubung", "Promo per varian diatur melalui katalog dan mengikuti jadwal server setelah migrasi database."],
  ["Pelanggan dan pengaturan akun", "/profil", "Pengelolaan belum tersedia", "Web memiliki akun dan profil; daftar pelanggan, penangguhan akun, serta manajemen peran belum tersedia di dashboard."],
];

export function Operations({ section }: { section: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(0), [search, setSearch] = useState(""), [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null), [draft, setDraft] = useState(blank), [editing, setEditing] = useState(false);
  const [promo, setPromo] = useState({ item_code: "", sale_price: 0, starts_at: "", ends_at: "", active: true });
  const [message, setMessage] = useState(""), [saving, setSaving] = useState(false), [category, setCategory] = useState("game");
  const session = useQuery({ queryKey: ["admin-session"], queryFn: () => request("session"), retry: false, staleTime: 30000 });
  const kind = section === "catalog" ? "products" : section === "overview" || section === "reports" ? "payments" : section;
  const supported = ["orders", "payments", "support", "products"].includes(kind);
  const records = useQuery({ queryKey: ["admin-records", kind, page], queryFn: () => request(`records/${kind}?page=${page}`), enabled: !!session.data && supported, refetchInterval: 30000 });
  const catalog = useQuery({ queryKey: ["admin-catalog", category], queryFn: () => request(`catalog/${category}`), enabled: !!session.data && section === "catalog" });
  const promotions = useQuery({ queryKey: ["admin-promotions", category], queryFn: () => request(`promotions/${category}`), enabled: !!session.data && section === "catalog" });
  useEffect(() => { setPage(0); setSearch(""); setFilter("all"); setSelected(null); setEditing(false); setMessage(""); }, [section]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ["admin-records"] }); void client.invalidateQueries({ queryKey: ["admin-catalog"] }); void client.invalidateQueries({ queryKey: ["admin-promotions"] }); };
  const rows: Row[] = records.data?.rows || [];
  const visible = rows.filter(row => (filter === "all" || row.status === filter) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  async function save() {
    setSaving(true); setMessage("");
    try {
      const id = draft.id || crypto.randomUUID();
      setDraft(previous => ({ ...previous, id }));
      const result = await request("products", "POST", { ...draft, id, price: Number(draft.price) });
      setMessage(result.published ? "Produk disimpan. Katalog web memakai perubahan ini; muat ulang halaman web untuk melihatnya." : "Produk disimpan sebagai konfigurasi. Publikasi web belum aktif: aktifkan ADMIN_CATALOG_ENABLED setelah migrasi.");
      setEditing(false); refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }
  async function savePromotion() {
    setSaving(true); setMessage("");
    try {
      const result = await request("promotions", "POST", { ...promo, category, sale_price: Number(promo.sale_price), starts_at: new Date(promo.starts_at).toISOString(), ends_at: new Date(promo.ends_at).toISOString() });
      setMessage(result.published ? "Promo disimpan dan terhubung ke katalog." : "Promo disimpan. Publikasi katalog admin belum aktif."); refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }  async function updateSupport(id: string, value: string) {
    setSaving(true); setMessage("");
    try { await request(`support/${id}`, "PATCH", { status: value }); setMessage("Status bantuan disimpan. Balasan ke pelanggan belum tersedia di web."); refresh(); }
    catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }
  return <div className="operations">
    {section === "access" && session.data?.superAdmin && <AccessManager />}

    {session.isPending ? <p role="status">Memeriksa akses administrator...</p> : session.error ? <div className="ops-notice" role="alert"><strong>Akses data belum tersedia</strong><p>{session.error.message}</p><a href={`${web}/login`} target="_blank" rel="noreferrer">Masuk melalui website</a><button className="ops-button" onClick={() => void session.refetch()}>Periksa akses lagi</button></div> : <p className="ops-connected">Akun administrator terverifikasi. Pembaruan data setiap 30 detik. <button className="text-button" onClick={refresh}>Muat ulang</button></p>}
    {section === "orders" && session.data && <FulfillmentRecords/>}
    {message && <div className="ops-notice" role="status">{message}</div>}
    {(section === "overview" || section === "reports") && <section className="panel"><h2>Pencatatan transaksi</h2><p>Pesanan simulasi dan pembayaran sandbox dicatat terpisah. Transaksi produksi serta laporan pendapatan belum tersedia di web.</p><div className="ops-summary"><div><strong>{records.data ? rows.length : "—"}</strong><span>Pembayaran pada halaman ini</span></div><div><strong>{records.data ? money(rows.filter(r => r.status === "paid").reduce((sum, r) => sum + Number(r.amount), 0)) : "—"}</strong><span>Nilai lunas sandbox pada halaman ini (bukan pendapatan)</span></div></div></section>}
    {section === "catalog" && <section className="panel"><div className="panel-heading"><div><h2>Produk dan provider</h2><p>Gunakan provider bebas (contoh: manual, digiflazz), kode produk, harga dasar, dan kategori yang tersedia di web. Promo web tetap dapat mengubah harga dasar.</p></div><button className="ops-button" disabled={!session.data} onClick={() => { setDraft(blank()); setEditing(true); setMessage(""); }}>Tambah produk</button></div><p className="ops-notice">{session.data?.catalogEnabled ? "Publikasi katalog aktif." : "Publikasi katalog admin belum aktif."} Koneksi API dan pengiriman otomatis provider baru belum tersedia. Menonaktifkan override VIPayment menyembunyikan SKU tersebut.</p>
      {editing && <form className="product-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        {([ ["provider", "Identitas provider", 60], ["provider_code", "Kode produk provider", 120], ["product", "Nama produk / game", 100], ["product_slug", "Slug produk (huruf kecil dan tanda hubung)", 100], ["name", "Nama varian", 200] ] as const).map(([key, label, max]) => <label key={key}>{label}<input required maxLength={max} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/></label>)}
        <label>Kategori<CustomSelect value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="game">Top up game</option><option value="prepaid">PPOB</option><option value="apps">Aplikasi premium</option></CustomSelect></label>
        <label>Harga dasar (Rp)<input type="number" required min="1" max="100000000" step="1" value={draft.price || ""} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })}/></label>
        <label className="ops-wide">Deskripsi<textarea maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
        <label className="ops-check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/>Tampilkan di katalog web</label>
        <div className="ops-actions"><button className="ops-button" disabled={saving}>{saving ? "Menyimpan..." : "Simpan produk"}</button><button type="button" className="ops-button" disabled={saving} onClick={() => setEditing(false)}>Batal</button></div>
      </form>}
    </section>}
    {section === "catalog" && session.data && <section className="panel"><h2>Flash sale per varian</h2><p>Pilih item yang sama dengan pilihan pelanggan, lalu atur harga dan jadwalnya.</p>
      <form className="product-editor" onSubmit={e => { e.preventDefault(); void savePromotion(); }}>
        <label>Varian<CustomSelect required value={promo.item_code} onChange={e => setPromo({ ...promo, item_code: e.target.value })}><option value="">Pilih varian</option>{catalog.data?.items?.map((item: Row) => <option key={item.code} value={item.code}>{item.product} · {item.displayName} ({item.code})</option>)}</CustomSelect></label>
        <label>Harga promo (Rp)<input type="number" min="1" max="100000000" required value={promo.sale_price || ""} onChange={e => setPromo({ ...promo, sale_price: Number(e.target.value) })}/></label>
        <label>Mulai<input type="datetime-local" required value={promo.starts_at} onChange={e => setPromo({ ...promo, starts_at: e.target.value })}/></label><label>Berakhir<input type="datetime-local" required value={promo.ends_at} onChange={e => setPromo({ ...promo, ends_at: e.target.value })}/></label>
        <label className="ops-check"><input type="checkbox" checked={promo.active} onChange={e => setPromo({ ...promo, active: e.target.checked })}/>Aktifkan sesuai jadwal</label><button className="ops-button" disabled={saving}>{saving ? "Menyimpan..." : "Simpan promo"}</button>
      </form>
      {promotions.error && <p role="alert">{promotions.error.message}</p>}{promotions.data?.rows?.length > 0 && <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Varian</th><th>Harga promo</th><th>Jadwal</th><th>Aksi</th></tr></thead><tbody>{promotions.data.rows.map((row: Row) => <tr key={row.item_code}><td>{row.item_code}</td><td>{money(row.sale_price)}</td><td>{date(row.starts_at)} – {date(row.ends_at)} · {row.active ? "Aktif" : "Nonaktif"}</td><td><button className="text-button" onClick={() => { const local = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }; setPromo({item_code:row.item_code, sale_price:row.sale_price, starts_at:local(row.starts_at), ends_at:local(row.ends_at), active:row.active}); }}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>}    {supported && session.data && <section className="panel"><div className="panel-heading"><div><h2>{kind === "orders" ? "Catatan pesanan simulasi" : kind === "payments" ? "Pembayaran Tripay sandbox" : kind === "support" ? "Permintaan bantuan dari web" : "Produk yang dikelola admin"}</h2><p>{kind === "orders" ? "Pesanan akun tersimpan di web. Invoice simulasi tidak memiliki verifikasi pembayaran." : kind === "payments" ? "Nomor pesanan, referensi pembayaran, dan status terverifikasi server. Pengiriman belum tersedia." : "Data tersimpan di database website."}</p></div></div>
      <div className="ops-toolbar"><label>Cari pada halaman ini<input placeholder="Nomor, produk, tujuan..." value={search} onChange={e => setSearch(e.target.value)}/></label>{["payments", "support"].includes(kind) && <label>Status<CustomSelect value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Semua status</option>{(kind === "payments" ? ["creating", "pending", "paid", "failed", "expired", "refunded", "unknown"] : ["new", "in_progress", "closed"]).map(value => <option key={value} value={value}>{status[value]}</option>)}</CustomSelect></label>}</div>
      {records.isPending ? <p role="status">Memuat data...</p> : records.error ? <div role="alert" className="ops-notice">{records.error.message}<button className="ops-button" onClick={() => void records.refetch()}>Coba lagi</button></div> : <><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>{kind === "products" ? "Produk / provider" : "Nomor / waktu"}</th><th>Rincian</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><strong>{kind === "products" ? row.product : row.id}</strong><small>{kind === "products" ? `${row.provider} / ${row.provider_code}` : date(row.created_at)}</small></td><td>{kind === "products" ? <>{row.name}<small>{money(row.price)} · {row.category}</small></> : kind === "payments" ? <>{row.product_name}<small>{money(row.amount)} · {row.method} · {row.target}</small><small>Referensi: {row.reference || "Belum diterima"}</small></> : kind === "orders" ? <>{row.items?.length || 0} item<small>{row.payment_method} · akun {row.user_id}</small></> : <>{row.name}<small>{row.email}</small></>}</td><td><span className="muted-badge">{kind === "products" ? row.active ? "Aktif" : "Nonaktif" : kind === "orders" ? "Simulasi" : status[row.status] || row.status}</span></td><td>{kind === "products" ? <button className="text-button" onClick={() => { setDraft(row as ReturnType<typeof blank>); setEditing(true); }}>Edit</button> : <button className="text-button" onClick={() => setSelected(row)}>Detail</button>}</td></tr>)}</tbody></table></div>{!visible.length && <p className="ops-empty">{rows.length ? "Tidak ada hasil yang cocok pada halaman ini." : "Belum ada catatan tersimpan."}</p>}<div className="ops-pagination"><button className="ops-button" disabled={!page || records.isFetching} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>Halaman {page + 1} · maksimal 50 catatan</span><button className="ops-button" disabled={!records.data?.hasMore || records.isFetching} onClick={() => setPage(page + 1)}>Berikutnya</button></div></>}
      {selected && <section className="ops-detail" aria-label="Detail catatan"><div className="panel-heading"><h3>Detail {selected.id}</h3><button className="ops-button" onClick={() => setSelected(null)}>Tutup detail</button></div>{kind === "support" ? <><p>{selected.message}</p><label>Status penanganan<CustomSelect aria-label="Status penanganan" disabled={saving} value={selected.status} onChange={e => { const value = e.target.value; void updateSupport(selected.id, value).then(() => setSelected(null)); }}><option value="new">Baru</option><option value="in_progress">Ditangani</option><option value="closed">Selesai</option></CustomSelect></label><p>Balasan CS belum tersedia di web. Perubahan ini hanya mencatat penanganan internal.</p></> : kind === "orders" ? <ul>{selected.items?.map((item: Row, index: number) => <li key={index}>{item.product} · {item.details} · {item.quantity} × {money(item.price)}<p>Tujuan: {item.target} · Kontak: {item.contact} · {status[item.status] || item.status}</p></li>)}</ul> : <p>{selected.product_name} · Tujuan {selected.target} · {status[selected.status]}. Pembayaran sandbox, tanpa pengiriman produk.</p>}</section>}
    </section>}
    {section === "catalog" && session.data && <section className="panel"><div className="panel-heading"><div><h2>Katalog yang dibaca website</h2><p>Pilih varian VIPayment untuk mengatur harga atau menyembunyikannya.</p></div><CustomSelect aria-label="Kategori katalog web" value={category} onChange={e => setCategory(e.target.value)}><option value="game">Game</option><option value="prepaid">PPOB</option><option value="apps">Aplikasi</option></CustomSelect></div>{catalog.isPending ? <p>Memuat katalog...</p> : catalog.error ? <p role="alert">{catalog.error.message}</p> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Produk</th><th>Harga web</th><th>Aksi</th></tr></thead><tbody>{catalog.data?.items?.map((item: Row) => <tr key={item.code}><td>{item.product} · {item.name}<small>{item.code}</small></td><td>{money(item.price)}</td><td><button className="text-button" onClick={() => { const existing = rows.find(r => r.provider === "vipayment" && r.provider_code === item.code); setDraft(existing as ReturnType<typeof blank> || { ...blank(), provider: "vipayment", provider_code: item.code, category, product: item.product, product_slug: item.productSlug, name: item.name, description: item.description, price: item.promotion?.originalPrice || item.price, active: true }); setEditing(true); }} disabled={item.code.startsWith("managed.")}>Atur produk</button></td></tr>)}</tbody></table></div>}</section>}

  </div>;
}
