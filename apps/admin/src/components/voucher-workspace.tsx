"use client";

import { AdminDrawer } from "./admin-drawer";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, X } from "lucide-react";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./voucher-workspace.module.css";

type Category = "game" | "prepaid" | "apps" | "social" | "tasks";
type Kind = "percent" | "fixed" | "gift";
type VoucherTarget = { category: Category; product_slug: string; variant_code: string | null };
type Scope = "all" | "category" | "targets";
type Voucher = {
  id: string; version: number; name: string; code: string | null; kind: Kind; value: number;
  discount_cap: number | null; minimum_amount: number; category: Category | null; product_slug: string | null;
  variant_code: string | null; starts_at: string; ends_at: string; total_limit: number;
  account_limit: number | null; allow_promotion: boolean; active: boolean;
  targets?: VoucherTarget[];
};
type Draft = Omit<Voucher,"id"|"version"|"targets"> & { id?: string; version?: number; targets: VoucherTarget[]; scope: Scope };
type Details = { usage: { used: number; reserved: number; released: number };
  accounts: { email: string; active: boolean }[]; hasMore: boolean };
type Redemption = { id:number; invoice_number:string; state:"used"|"reserved"|"released"; discount:number;
  created_at:string; premium_id:string|null; can_release:boolean };
type Catalog = { products: { slug: string; name: string }[];
  items: { code: string; productSlug: string; name: string; price: number }[] };
const categories: [Category, string][] = [["game","Top up game"],["prepaid","PPOB"],["apps","Aplikasi premium"],["social","Booster media sosial"],["tasks","Joki tugas"]];
const kinds = { percent: "Diskon persen", fixed: "Potongan rupiah", gift: "Hadiah produk" };
const redemptionStates = { used:"Terpakai", reserved:"Direservasi", released:"Dibebaskan" };
function voucherStatus(row:Voucher){
  if(!row.active)return {label:"Nonaktif",tone:"inactive"};
  if(Date.parse(row.ends_at)<=Date.now())return {label:"Kedaluwarsa",tone:"expired"};
  if(Date.parse(row.starts_at)>Date.now())return {label:"Terjadwal",tone:"scheduled"};
  return {label:"Aktif",tone:"active"};
}
const wib = (time: string) => new Date(Date.parse(time) + 7 * 3600000).toISOString().slice(0,16);
const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Jakarta" });
const isoDate = (value: string) => new Date(value + ":00+07:00").toISOString();

function VoucherTargets({ targets, gift, onChange }: {
  targets: VoucherTarget[]; gift: boolean; onChange: (targets: VoucherTarget[]) => void;
}) {
  const client = useQueryClient();
  const [category, setCategory] = useState<Category | "">("");
  const [product, setProduct] = useState("");
  const catalog = useQuery({
    queryKey: ["voucher-catalog", category],
    enabled: category !== "",
    queryFn: () => adminRequest("catalog/" + category) as Promise<Catalog>,
  });
  const variants = catalog.data?.items.filter(item => item.productSlug === product) ?? [];
  const selected = targets.filter(target => target.category === category && target.product_slug === product);
  const wholeProduct = selected.some(target => target.variant_code === null);
  const availableCategories = categories.filter(([key]) => !gift || key !== "social" && key !== "tasks");
  function toggle(variant: string | null, checked: boolean) {
    if (!category || !product) return;
    const remaining = targets.filter(target => target.category !== category || target.product_slug !== product ||
      (variant !== null && target.variant_code !== variant));
    onChange(checked ? [...remaining, { category, product_slug: product, variant_code: variant }] : remaining);
  }
  return (
    <fieldset className={styles.targets}>
      <legend>Produk dan varian yang berlaku</legend>
      <div className={styles.targetFilters}>
        <label>Kategori produk<select value={category} onChange={event => {
          setCategory(event.target.value as Category | "");
          setProduct("");
        }}>
          <option value="">Pilih kategori</option>
          {availableCategories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Produk<select value={product} disabled={!catalog.data} onChange={event => setProduct(event.target.value)}>
          <option value="">Pilih produk</option>
          {catalog.data?.products.map(row => <option key={row.slug} value={row.slug}>{row.name}</option>)}
        </select></label>
      </div>
      {category && catalog.isPending && <p role="status">Memuat produk…</p>}
      {catalog.error && <p role="alert">{catalog.error.message}</p>}
      {product && <fieldset className={styles.targetVariants}>
        <legend>Varian produk</legend>
        {!gift && <label className={styles.check}>
          <input type="checkbox" checked={wholeProduct} onChange={event => toggle(null, event.target.checked)}/>
          Semua varian produk ini
        </label>}
        {variants.map(row => {
          const checked = selected.some(target => target.variant_code === row.code);
          return <label key={row.code} className={styles.check}>
            <input type="checkbox" checked={wholeProduct || checked} disabled={wholeProduct}
              onChange={event => toggle(row.code, event.target.checked)}/>
            <span>{row.name} <small>· {rupiah(row.price)}</small></span>
          </label>;
        })}
      </fieldset>}
      <p className={styles.targetCount}>{targets.length} target dipilih. Pilih produk lain untuk menambah target.</p>
      {!!targets.length && <ul className={styles.selectedTargets}>
        {targets.map((target, index) => {
          const data = client.getQueryData<Catalog>(["voucher-catalog", target.category]);
          const name = data?.products.find(row => row.slug === target.product_slug)?.name ?? target.product_slug;
          const variant = target.variant_code === null ? "Semua varian"
            : data?.items.find(row => row.productSlug === target.product_slug && row.code === target.variant_code)?.name ?? target.variant_code;
          const label = categories.find(([key]) => key === target.category)?.[1] + " · " + name + " · " + variant;
          return <li key={JSON.stringify(target)}>
            <span>{label}</span>
            <button type="button" className="outline-button" aria-label={"Hapus target " + label}
              onClick={() => onChange(targets.filter((_, item) => item !== index))}>Hapus</button>
          </li>;
        })}
      </ul>}
    </fieldset>
  );
}

function newVoucher(): Draft {
  const now = Date.now();
  return { name:"", code:"", kind:"percent", value:10, discount_cap:null, minimum_amount:0, category:null, targets:[], scope:"all",
    product_slug:null, variant_code:null, starts_at:wib(new Date(now).toISOString()), ends_at:wib(new Date(now + 7 * 86400000).toISOString()),
    total_limit:100, account_limit:1, allow_promotion:false, active:false };
}

export function VoucherWorkspace() {
  const client = useQueryClient();
  const [page,setPage] = useState(0);
  const [accountPage,setAccountPage] = useState(0);
  const [redemptionPage,setRedemptionPage] = useState(0);
  const [draft,setDraft] = useState<Draft|null>(null);
  const [email,setEmail] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const editorOpen = draft !== null;

  useEffect(() => {
    if (editorOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [editorOpen]);

  const list = useQuery({ queryKey:["vouchers",page],
    queryFn:() => adminRequest("vouchers?page=" + page) as Promise<{ rows: Voucher[]; hasMore: boolean }> });
  const detail = useQuery({ queryKey:["voucher-details",draft?.id,accountPage], enabled:!!draft?.id,
    queryFn:() => adminRequest("vouchers/" + draft!.id + "?page=" + accountPage) as Promise<Details> });
  const redemptions = useQuery({ queryKey:["voucher-redemptions",draft?.id,redemptionPage], enabled:!!draft?.id,
    queryFn:() => adminRequest("vouchers/" + draft!.id + "/redemptions?page=" + redemptionPage) as Promise<{rows:Redemption[];hasMore:boolean}> });
  function open(row: Draft | Voucher) {
    const targets = row.targets?.length ? row.targets : row.category && row.product_slug
      ? [{ category: row.category, product_slug: row.product_slug, variant_code: row.variant_code }]
      : [];
    const scope = targets.length ? "targets" : row.category ? "category" : "all";
    setDraft({ ...row, scope, targets, product_slug: null, variant_code: null,
      category: scope === "category" ? row.category : null });
    setAccountPage(0);
    setRedemptionPage(0);
    setEmail("");
    setError("");
    setNotice("");
  }
  function update(change: Partial<Draft>) {
    setDraft(current => current ? { ...current, ...change } : null);
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    if (draft.scope === "targets" && !draft.targets.length) {
      setError("Pilih minimal satu produk atau varian untuk voucher ini.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { scope, ...settings } = draft;
      const result = await adminRequest("vouchers", "POST", {
        ...settings, category: scope === "category" ? settings.category : null,
        targets: scope === "targets" ? settings.targets : [],
        starts_at: isoDate(draft.starts_at), ends_at: isoDate(draft.ends_at),
      }) as { voucher: Voucher };
      open({ ...result.voucher, starts_at:wib(result.voucher.starts_at), ends_at:wib(result.voucher.ends_at) });
      await client.invalidateQueries({ queryKey:["vouchers"] });
      setNotice("Voucher disimpan.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function assign(address: string, active: boolean) {
    if (!draft?.id || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("vouchers/" + draft.id + "/accounts","POST",{ email:address, active });
      setEmail("");
      await client.invalidateQueries({ queryKey:["voucher-details",draft.id] });
      setNotice(active ? "Voucher diberikan ke akun." : "Akses voucher akun dicabut.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function release(row: Redemption) {
    if (!draft?.id || !row.premium_id || busy || !window.confirm(
      "Sudah periksa mutasi QRIS dan memastikan invoice " + row.invoice_number + " belum dibayar? Pesanan akan dibatalkan dan kuota voucher dilepas."
    )) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("vouchers/" + draft.id + "/release-premium","POST",{orderId:row.premium_id,confirmedUnpaid:true});
      await Promise.all([
        client.invalidateQueries({ queryKey:["voucher-redemptions",draft.id] }),
        client.invalidateQueries({ queryKey:["voucher-details",draft.id] }),
      ]);
      setNotice("Pesanan dibatalkan dan kuota voucher dilepas.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="workspace-heading"><div><h1>Voucher</h1><p>Kelola diskon, hadiah produk, dan voucher pelanggan.</p></div>
      <button type="button" className="primary-button" disabled={!list.data || busy} onClick={()=>open(newVoucher())}>Buat voucher</button></div>
    {list.isPending && <p role="status">Memuat voucher…</p>}
    {list.error && <p role="alert" className="workspace-error">{list.error.message}</p>}
    {list.data && <section className="commerce-panel">
      <div className="commerce-table-wrap">
        <table className="commerce-table">
          <thead><tr><th>Voucher</th><th>Jenis</th><th>Jadwal berakhir</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>{list.data.rows.map(row => <tr key={row.id}>
            <td><strong>{row.name}</strong><small>{row.code ?? "Khusus akun"}</small></td>
            <td><span className={`${styles.badge} ${styles["kind_"+row.kind]}`}>{kinds[row.kind]}</span></td>
            <td><strong>{dateLabel.format(new Date(row.ends_at))} WIB</strong><small>Mulai {dateLabel.format(new Date(row.starts_at))} WIB</small></td>
            <td>{(()=>{const state=voucherStatus(row);return <span className={`${styles.badge} ${styles[state.tone]}`}>{state.label}</span>;})()}</td>
            <td><button type="button" className="outline-button" disabled={busy}
              onClick={()=>open({...row,starts_at:wib(row.starts_at),ends_at:wib(row.ends_at)})}>Kelola <span className="sr-only">{row.name}</span></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!list.data.rows.length && <p className={styles.hint}>Belum ada voucher.</p>}
      {(page > 0 || list.data.hasMore) && <div className="table-footer"><span>Halaman {page+1}</span><div>
        <button type="button" className="outline-button" disabled={!page} onClick={()=>setPage(page-1)}>Sebelumnya</button>
        <button type="button" className="outline-button" disabled={!list.data.hasMore} onClick={()=>setPage(page+1)}>Berikutnya</button>
      </div></div>}
    </section>}

    <AdminDrawer
      ref={dialog}
      className={`order-dialog ${styles.editor}`}
      aria-labelledby="voucher-editor-title"
      dismissDisabled={busy}
      onClose={() => setDraft(null)}
    >{draft && <>
      <header className="drawer-header">
        <div>
          {draft.id && <span>Detail voucher</span>}
          <h1 id="voucher-editor-title">{draft.id ? draft.code || draft.name || "Voucher" : "Voucher baru"}</h1>
        </div>
        <form method="dialog">
          <button type="submit" className="square-button" aria-label="Tutup panel voucher" disabled={busy}><X size={20} aria-hidden="true"/></button>
        </form>
      </header>
      <div className="drawer-content">
      {draft.id && <>
        <div className="detail-product">
          <span className="detail-product-icon"><Ticket size={24} aria-hidden="true"/></span>
          <div><h2>{draft.name || "Voucher"}</h2></div>
          {draft.kind !== "gift" && <strong>{draft.kind === "percent" ? `${draft.value}%` : rupiah(draft.value)}</strong>}
        </div>
        <div className="detail-status-grid">
          <div><span>Jenis</span><span className={`${styles.badge} ${styles["kind_" + draft.kind]}`}>{kinds[draft.kind]}</span></div>
          <div><span>Distribusi</span><strong>{draft.code === null ? "Khusus akun" : "Kode dan akun"}</strong></div>
        </div>
      </>}
      {error && <p className="workspace-error" role="alert">{error}</p>}
      {notice && <p className="workspace-feedback" role="status">{notice}</p>}
      <section className={`detail-section ${styles.settings}`} aria-labelledby="voucher-settings-title">
      <h2 id="voucher-settings-title">Pengaturan voucher</h2>
      <form className={`variant-form ${styles.form}`} onSubmit={save} aria-labelledby="voucher-settings-title">
        <fieldset className={styles.fields} disabled={busy}>
          <legend className="sr-only">Aturan penggunaan</legend>
          <label>Nama voucher (wajib)<input name="name" required maxLength={100} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
          <label>Distribusi<select name="distribution" value={draft.code === null ? "account" : "code"}
            onChange={e=>update({code:e.target.value==="account"?null:""})}><option value="code">Kode dan akun</option><option value="account">Khusus akun</option></select></label>
          {draft.code !== null && <label>Kode voucher<input name="code" minLength={8} maxLength={64} pattern="[A-Z0-9][A-Z0-9_\-]{7,63}"
            autoComplete="off" spellCheck={false} autoCapitalize="characters" value={draft.code} onChange={e=>update({code:e.target.value.toUpperCase()})}/>
            <small>Kosongkan untuk membuat kode acak. Panjang 8–64 karakter.</small></label>}
          <label>Jenis voucher<select name="kind" value={draft.kind} onChange={e=>{
            const kind=e.target.value as Kind;
            update({kind,value:kind==="fixed"?1000:10,discount_cap:null,...(kind==="gift"?{
              scope:"targets", category:null, account_limit:1,
              targets:draft.targets.filter(target=>target.variant_code!==null && target.category!=="social" && target.category!=="tasks"),
            }:{})});
          }}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {draft.kind !== "gift" && <label>{draft.kind==="percent"?"Diskon (%)":"Potongan (Rp)"}<input name="value" type="number" required min={1} max={draft.kind==="percent"?99:100000000}
            value={draft.value || ""} onChange={e=>update({value:Number(e.target.value)})}/></label>}
          {draft.kind !== "fixed" && <label>{draft.kind==="gift"?"Nilai maksimum produk hadiah (Rp)":"Batas potongan (Rp, opsional)"}<input name="discount-cap" type="number"
            required={draft.kind==="gift"} min={1} max={100000000} value={draft.discount_cap ?? ""}
            onChange={e=>update({discount_cap:e.target.value?Number(e.target.value):null})}/></label>}
          <label>Minimum subtotal (Rp)<input name="minimum" type="number" min={0} max={100000000} value={draft.minimum_amount}
            onChange={e=>update({minimum_amount:Number(e.target.value)})}/></label>
          {draft.kind !== "gift" && <label>Cakupan voucher<select name="scope" value={draft.scope}
            onChange={e=>update({scope:e.target.value as Scope})}>
            <option value="all">Semua kategori</option>
            <option value="category">Semua produk di satu kategori</option>
            <option value="targets">Pilih produk dan varian</option>
          </select></label>}
          {draft.scope === "category" && <label>Kategori<select name="category" required value={draft.category??""}
            onChange={e=>update({category:(e.target.value||null) as Category|null})}>
            <option value="">Pilih kategori</option>
            {categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>}
          {draft.scope === "targets" && <VoucherTargets key={draft.kind === "gift" ? "gift" : "discount"}
            targets={draft.targets} gift={draft.kind === "gift"} onChange={targets=>update({targets})}/>}
          <label>Mulai (WIB)<input name="starts" type="datetime-local" required value={draft.starts_at} onChange={e=>update({starts_at:e.target.value})}/></label>
          <label>Berakhir (WIB)<input name="ends" type="datetime-local" required min={draft.starts_at} value={draft.ends_at} onChange={e=>update({ends_at:e.target.value})}/></label>
          <label>Kuota total (wajib)<input name="total" type="number" required min={1} max={1000000} value={draft.total_limit||""} onChange={e=>update({total_limit:Number(e.target.value)})}/></label>
          <label>Batas per akun<input name="account-limit" type="number" required={draft.kind==="gift"} min={1} max={draft.total_limit} value={draft.account_limit??""}
            onChange={e=>update({account_limit:e.target.value?Number(e.target.value):null})}/>
            <small>Jika diisi, voucher hanya bisa dipakai setelah login.</small></label>
          <label className={styles.check}><input name="promotion" type="checkbox" checked={draft.allow_promotion} onChange={e=>update({allow_promotion:e.target.checked})}/>Boleh digabung dengan promo katalog</label>
          <label className={styles.check}><input name="active" type="checkbox" checked={draft.active} onChange={e=>update({active:e.target.checked})}/>Aktifkan voucher sesuai jadwal</label>
        </fieldset>
        <button className="primary-button" type="submit" disabled={busy}>{busy?"Memproses…":"Simpan voucher"}</button>
      </form>
      </section>
      {draft.id && <section className={`detail-section ${styles.accounts}`} aria-labelledby="voucher-accounts-title">
        <h2 id="voucher-accounts-title">Voucher akun</h2>
        {detail.isPending && <p role="status">Memuat pemakaian dan akun…</p>}
        {detail.error && <p role="alert" className="workspace-error">{detail.error.message}</p>}
        {detail.data && <p className={styles.hint}>{detail.data.usage.used} terpakai · {detail.data.usage.reserved} direservasi · {detail.data.usage.released} dibebaskan</p>}
        <form className={`variant-form ${styles.assign}`} onSubmit={event=>{event.preventDefault();void assign(email,true);}}>
          <label>Email akun terverifikasi<input name="email" type="email" required maxLength={254} value={email}
            onChange={event=>setEmail(event.target.value)} disabled={busy}/></label>
          <button className="outline-button" type="submit" disabled={busy}>Berikan voucher</button>
        </form>
        {detail.data?.accounts.map(row => <div className={styles.accountRow} key={row.email}>
          <span>{row.email} <small>{row.active?"Aktif":"Dicabut"}</small></span>
          <button type="button" className="outline-button" disabled={busy} onClick={()=>void assign(row.email,!row.active)}>
            {row.active?"Cabut":"Aktifkan lagi"}</button>
        </div>)}
        {(accountPage > 0 || detail.data?.hasMore) && <div className="table-footer"><span>Halaman {accountPage+1}</span><div>
          <button type="button" className="outline-button" disabled={!accountPage} onClick={()=>setAccountPage(accountPage-1)}>Sebelumnya</button>
          <button type="button" className="outline-button" disabled={!detail.data?.hasMore} onClick={()=>setAccountPage(accountPage+1)}>Berikutnya</button>
        </div></div>}
      </section>}
      {draft.id && <section className={`detail-section ${styles.accounts}`} aria-labelledby="voucher-usage-title">
        <h2 id="voucher-usage-title">Riwayat pemakaian</h2>
        {redemptions.isPending && <p role="status">Memuat riwayat pemakaian…</p>}
        {redemptions.error && <p role="alert" className="workspace-error">{redemptions.error.message}</p>}
        {redemptions.data?.rows.length ? <ul className={styles.redemptions}>
          {redemptions.data.rows.map(row => <li key={row.id}>
            <div><strong>{row.invoice_number}</strong><small>{dateLabel.format(new Date(row.created_at))} WIB</small></div>
            <div className={styles.redemptionStatus}>
              <strong>{rupiah(row.discount)}</strong>
              <span className={`${styles.badge} ${styles["redemption_" + row.state]}`}>{redemptionStates[row.state]}</span>
            </div>
            {row.can_release && <button type="button" className="outline-button" disabled={busy}
              onClick={()=>void release(row)}>Batalkan & lepas kuota</button>}
          </li>)}
        </ul> : redemptions.data && <p className={styles.hint}>Belum ada pemakaian.</p>}
        {(redemptionPage > 0 || redemptions.data?.hasMore) && <div className="table-footer"><span>Halaman {redemptionPage+1}</span><div>
          <button type="button" className="outline-button" disabled={!redemptionPage} onClick={()=>setRedemptionPage(redemptionPage-1)}>Sebelumnya</button>
          <button type="button" className="outline-button" disabled={!redemptions.data?.hasMore} onClick={()=>setRedemptionPage(redemptionPage+1)}>Berikutnya</button>
        </div></div>}
      </section>}
      </div>
    </>}</AdminDrawer>
  </>;
}
