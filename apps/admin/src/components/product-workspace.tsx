"use client";
import { SearchField } from "@anres/ui";
import { AdminInput, AdminTextarea } from "./form-controls";

import { CustomSelect } from "./custom-select";
import { TaskPricingEditor } from "./task-pricing-editor";
import { AssistantVariantPanel } from "./assistant-variant-panel";
import { PremiumRulesEditor } from "./premium-rules-editor";

import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Plus, RefreshCw, ArrowLeft, ArrowRight, X, Boxes, Package, Pencil, Eye, EyeOff, ChevronLeft, ChevronRight, Trash2, Sparkles } from "lucide-react";

import { adminRequest, rupiah } from "./workspace-api";

type Variant={deleted_at?:string|null;id:string;provider:string;provider_code:string;category:string;product:string;product_slug:string;section?:string|null;name:string;price:number;cost_price?:number|null;description:string;active:boolean;fulfillment_mode?:"manual"|"vipayment";supplier_code?:string;service_quantity?:number;sourcePrice?:number;managed:boolean};

type SourceItem={code:string;category:string;product:string;productSlug:string;name:string;section?:string|null;price:number;description:string;providerCost?:number;defaultPublished?:boolean;minimum?:number;maximum?:number;requiresManualReview?:boolean};

type Management={items:SourceItem[];managed:Variant[];providerAvailable:boolean;published:boolean;canWrite:boolean};

const blank=(category:string):Variant=>({id:"",provider:"manual",provider_code:"",category,product:"",product_slug:"",section:"",name:"",price:0,cost_price:null,description:"",active:false,managed:false,fulfillment_mode:"manual",service_quantity:1});

const localTime=(s:string)=>{const d=new Date(s);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};

const catalogCategories = [["game","Top up game"],["prepaid","PPOB & pulsa"],["apps","App premium"],["social","Sosmed"],["tasks","Joki tugas"]] as const;
const variantKey = (row: Variant) => `${row.provider}:${row.provider_code}`;
const supplierCode = (row: Variant) => row.supplier_code || row.provider_code;
const sectionName = (row: Variant, item?: SourceItem) => row.section?.trim() || item?.section ||
 (row.category === "tasks" ? "Paket tugas" : row.category === "apps" ? "Pilihan akses" : row.category === "social" ? "Pilihan layanan" : "Paket lainnya");
const productSlug = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function ProductWorkspace(){

 const [category,setCategory]=useState("game"),[parent,setParent]=useState(""),[search,setSearch]=useState(""),[status,setStatus]=useState("all"),[page,setPage]=useState(0),[draft,setDraft]=useState<Variant|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[formMessage,setFormMessage]=useState(""),[picked,setPicked]=useState<string[]>([]),[mappingTarget,setMappingTarget]=useState(""),[confirmRemove,setConfirmRemove]=useState(false);

 const [parentSearch, setParentSearch] = useState("");
 const [origin, setOrigin] = useState("all");
 const [providerStatus, setProviderStatus] = useState("all");
 const [assistantOpen,setAssistantOpen]=useState(false);
 const [promotion,setPromotion]=useState({sale_price:0,starts_at:"",ends_at:"",active:false});

 const [providerOpen,setProviderOpen]=useState(false),[providerSearch,setProviderSearch]=useState(""),[providerLimit,setProviderLimit]=useState(30);
 const providerDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(providerOpen&&!providerDialog.current?.open)providerDialog.current?.showModal();if(!providerOpen&&providerDialog.current?.open)providerDialog.current.close();},[providerOpen]);
 const dialog=useRef<HTMLDialogElement>(null),client=useQueryClient();

 const query=useQuery({queryKey:["product-management",category],queryFn:()=>adminRequest(`product-management/${category}`) as Promise<Management>,refetchInterval:30000});

 const promos=useQuery({queryKey:["product-promotions",category],queryFn:()=>adminRequest(`promotions/${category}`),enabled:!!draft});

 const { source, rows, parents, providerVariants, hiddenCount } = useMemo(() => {
  const source = new Map((query.data?.items ?? []).map(item => [item.code, item]));
  const variants = new Map<string, Variant>();
  for (const item of source.values()) {
   if (item.defaultPublished === false) continue;
   variants.set(`vipayment:${item.code}`, {
    ...blank(category), provider: "vipayment", provider_code: item.code,
    product: item.product, product_slug: item.productSlug, name: item.name,
    price: item.price, description: item.description, active: true, sourcePrice: item.price,
    cost_price: item.providerCost ?? null, fulfillment_mode: "vipayment",
   });
  }
  for (const item of query.data?.managed ?? []) {
   const supplier = item.provider === "vipayment" ? source.get(supplierCode(item)) : undefined;
   variants.set(variantKey(item), {
    ...item, price: Number(item.price), sourcePrice: supplier?.price,
    cost_price: item.cost_price ?? (supplier?.providerCost == null ? null : category === "social" ? Math.ceil(supplier.providerCost * (item.service_quantity ?? 1000) / 1000) : supplier.providerCost), managed: true,
   });
  }
  const rows = [...variants.values()].filter(row => !row.deleted_at);
  const groups = new Map<string, {slug:string;name:string;count:number;active:number;min:number}>();
  const providerVariants = new Map<string, Variant[]>();
  let hiddenCount = 0;
  for (const row of rows) {
   const group = groups.get(row.product_slug) ?? { slug: row.product_slug, name: row.product, count: 0, active: 0, min: row.price };
   group.count++;
   group.active += Number(row.active);
   group.min = Math.min(group.min, row.price);
   groups.set(group.slug, group);
   hiddenCount += Number(!row.active);
   if (row.provider === "vipayment") {
    const code = supplierCode(row);
    const mapped = providerVariants.get(code) ?? [];
    mapped.push(row);
    providerVariants.set(code, mapped);
   }
  }
  return { source, rows, providerVariants, hiddenCount, parents: [...groups.values()].sort((a,b) => a.name.localeCompare(b.name, "id")) };
 }, [category, query.data]);

 const selectedParent = parents.find(product => product.slug === parent);
 const parentTerm = parentSearch.trim().toLowerCase();
 const matchingParents = parents.filter(product => `${product.name} ${product.slug}`.toLowerCase().includes(parentTerm));
 const term = search.trim().toLowerCase();
 const filtered = rows.filter(row =>
  (!parent || row.product_slug === parent) &&
  (status === "all" || (status === "active" ? row.active : status === "inactive" ? !row.active : row.managed)) &&
  (origin === "all" || (origin === "vipayment") === (row.provider === "vipayment")) &&
  [row.name, row.product, row.product_slug, row.provider_code, supplierCode(row), sectionName(row, row.provider === "vipayment" ? source.get(supplierCode(row)) : undefined), row.provider].join(" ").toLowerCase().includes(term),
 );
 const providerTerm = providerSearch.trim().toLowerCase();
 const matchingServices = useMemo(() => {
  if (!providerOpen) return [];
  return [...source.values()].filter(item => {
   const mapped = providerVariants.get(item.code) ?? [];
   if (providerStatus === "mapped" && !mapped.length || providerStatus === "unmapped" && mapped.length) return false;
   return [item.product, item.name, item.code, item.section, ...mapped.flatMap(row => [row.name, row.product])].join(" ").toLowerCase().includes(providerTerm);
  });
 }, [providerOpen, providerStatus, providerTerm, providerVariants, source]);
 const visible = filtered.slice(page * 25, (page + 1) * 25);
 useEffect(() => setPage(previous => Math.min(previous, Math.max(0, Math.ceil(filtered.length / 25) - 1))), [filtered.length]);
 const pickedKeys = new Set(picked);
 const selectedRows = rows.filter(row => pickedKeys.has(variantKey(row)));

 const canActivate=!!query.data?.canWrite&&!busy&&selectedRows.length>0&&(selectedRows.length>1||!selectedRows[0]!.active);
 const canHide=!!query.data?.canWrite&&!busy&&selectedRows.length>0&&(selectedRows.length>1||selectedRows[0]!.active);

 useEffect(()=>{setPage(0);setPicked([]);setMappingTarget("");},[parent,search,status,origin,category]);

 useEffect(()=>{if(draft&&!dialog.current?.open)dialog.current?.showModal();if(!draft&&dialog.current?.open)dialog.current.close();},[draft]);

 const draftSupplier = draft?.provider === "vipayment" ? source.get(supplierCode(draft)) : undefined;
 const duplicateSocialPackage = !!draft && category === "social" && draft.provider === "vipayment" && !draft.managed &&
  !!providerVariants.get(supplierCode(draft))?.some(row => (row.service_quantity ?? 1000) === draft.service_quantity);
 const itemCode=draft?(draft.provider==="vipayment" && category!=="social"?draft.provider_code:`managed.${draft.id}`):"";

 const savedPromo=promos.data?.rows?.find((promo:{item_code:string})=>promo.item_code===itemCode);
 const now=Date.now();
 const activePromoPrice=savedPromo?.active&&Date.parse(savedPromo.starts_at)<=now&&now<Date.parse(savedPromo.ends_at)?Number(savedPromo.sale_price):undefined;

 useEffect(()=>{setPromotion(savedPromo?{sale_price:Number(savedPromo.sale_price),starts_at:localTime(savedPromo.starts_at),ends_at:localTime(savedPromo.ends_at),active:savedPromo.active}:{sale_price:0,starts_at:"",ends_at:"",active:false});},[itemCode,savedPromo]);

 const invalidate=async()=>{await Promise.all([client.invalidateQueries({queryKey:["product-management"]}),client.invalidateQueries({queryKey:["product-promotions"]}),client.invalidateQueries({queryKey:["admin-catalog"]})]);};

 function open(row?:Variant){setAssistantOpen(false);setConfirmRemove(false);setDraft(row?{...row}:{...blank(category),id:crypto.randomUUID(),product:selectedParent?.name || "",product_slug:parent});setFormMessage("");}

 async function remove(){if(!draft)return;setBusy(true);setFormMessage("");try{await adminRequest("products/remove","POST",{...draft,id:draft.id||crypto.randomUUID()});await invalidate();setDraft(null);setPicked([]);setMessage("Varian dihapus dari katalog dan tidak tersedia untuk checkout baru.");}catch(e){setFormMessage((e as Error).message);await invalidate();}finally{setBusy(false);}}

 function selectProviderService(item: SourceItem) {
  const quantity = category === "social" ? Math.min(item.maximum ?? 1000, Math.max(item.minimum ?? 1, 1000)) : 1;
  setProviderOpen(false);
  open({
   ...blank(category), id: crypto.randomUUID(), provider: "vipayment",
   provider_code: category === "social" ? `${item.code}-${quantity}` : item.code,
   supplier_code: item.code, fulfillment_mode: item.requiresManualReview ? "manual" : "vipayment",
   service_quantity: quantity, product: selectedParent?.name ?? item.product,
   product_slug: selectedParent?.slug ?? item.productSlug, name: item.name,
   description: item.description, sourcePrice: item.price,
   price: category === "social" ? Math.max(1, Math.ceil(item.price * quantity / 1000)) : item.price,
   cost_price: item.providerCost == null ? null : category === "social" ? Math.ceil(item.providerCost * quantity / 1000) : item.providerCost,
  });
 }

 function editProviderVariant(row: Variant) {
  setProviderOpen(false);
  open(row);
 }

 async function save() {
  if (!draft || busy || !query.data?.canWrite) return;
  const quantity = draft.service_quantity ?? 1000;
  const providerCode = category === "social" && draft.provider === "vipayment" && draft.supplier_code && !draft.managed
   ? `${supplierCode(draft)}-${quantity}` : draft.provider_code;
  if (duplicateSocialPackage || !draft.managed && rows.some(row => row.managed && row.provider === draft.provider && row.provider_code === providerCode)) {
   setFormMessage("SKU ini sudah dipetakan. Buka varian yang tersimpan atau gunakan jumlah paket lain.");
   return;
  }
  setBusy(true);
  setFormMessage("");
  try {
   const result = await adminRequest("products", "POST", { ...draft, provider_code: providerCode, id: draft.id || crypto.randomUUID(), price: Number(draft.price) });
   await invalidate();
   setDraft(null);
   setMessage(result.published ? "Varian disimpan. Perubahan tersedia di katalog dan checkout web." : "Varian disimpan. Publikasi katalog admin belum diaktifkan pada server.");
  } catch (error) {
   setFormMessage((error as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function changeQuantity(quantity: number) {
  if (!draft) return;
  const item = source.get(supplierCode(draft));
  const original = draft.service_quantity ?? 1000;
  const suggestedPrice = item ? Math.max(1, Math.ceil(item.price * quantity / 1000)) : draft.price;
  const updatePrice = item && draft.price === Math.max(1, Math.ceil(item.price * original / 1000));
  const cost = item?.providerCost;
  const updateCost = cost != null && draft.cost_price === Math.ceil(cost * original / 1000);
  setDraft({
   ...draft, service_quantity: quantity,
   ...(!draft.managed && draft.provider === "vipayment" && draft.supplier_code ? {
    provider_code: `${supplierCode(draft)}-${quantity}`,
    price: updatePrice ? suggestedPrice : draft.price,
    cost_price: updateCost ? Math.ceil(cost * quantity / 1000) : draft.cost_price,
   } : {}),
  });
 }

 async function bulk(active:boolean, targetSlug?:string){const items=selectedRows;if(!items.length||busy||!query.data?.canWrite)return;setBusy(true);setMessage("");let saved=0;try{for(const r of items){await adminRequest("products","POST",{...r,id:r.id||crypto.randomUUID(),active:targetSlug?r.active:active,...(targetSlug?{product_slug:targetSlug,product:parents.find(p=>p.slug===targetSlug)!.name}:{})});saved++;setPicked(previous=>previous.filter(value=>value!==variantKey(r)));}setMessage(targetSlug?`${saved} varian dipindahkan ke produk ${parents.find(p=>p.slug===targetSlug)!.name}.`:`${saved} varian ${active?"diaktifkan":"disembunyikan"}.`);setPicked([]);}catch(e){setMessage(`${saved} dari ${items.length} varian berhasil diperbarui. ${(e as Error).message}`);}finally{await invalidate();setBusy(false);}}

 async function savePromo(){if(!draft)return;setBusy(true);setFormMessage("");try{await adminRequest("promotions","POST",{category,item_code:itemCode,...promotion,sale_price:Number(promotion.sale_price),starts_at:new Date(promotion.starts_at).toISOString(),ends_at:new Date(promotion.ends_at).toISOString()});await invalidate();setFormMessage("Jadwal promo berhasil disimpan.");}catch(e){setFormMessage((e as Error).message);}finally{setBusy(false);}}

 return <div className="product-workspace"><div className="workspace-heading"><div><h1>Katalog & harga</h1><p>Petakan produk, kelola setiap varian, dan atur harga untuk website.</p></div><div className="heading-actions"><button className="square-button" aria-label="Perbarui katalog" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={16}/></button>{["game", "prepaid", "social"].includes(category)&&<button className="outline-button" disabled={busy||!query.data} onClick={()=>{setProviderSearch("");setProviderStatus("all");setProviderLimit(30);setProviderOpen(true);}}><Plus size={16}/>Petakan VIPayment</button>}<button className="primary-button" disabled={busy||!query.data?.canWrite} onClick={()=>open()}><Plus size={16}/>Tambah varian</button></div></div>

  <div className="catalog-category-tabs" role="group" aria-label="Kategori produk">{catalogCategories.map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setStatus("all");setOrigin("all");setParent("");setParentSearch("");setSearch("");setMessage("");}}>{label}</button>)}</div>

  {query.data&&<div className="catalog-summary"><span><strong>{parents.length}</strong> produk induk</span><span><strong>{rows.length}</strong> varian</span><span><i className="green-dot"/><strong>{rows.length - hiddenCount}</strong> aktif</span><span><strong>{hiddenCount}</strong> disembunyikan</span><span className={query.data.published?"publishing-state":"publishing-state unpublished"}>{query.data.published?"Terhubung ke katalog web":"Publikasi belum aktif"}</span></div>}

  {message&&<p className="workspace-feedback" role="status">{message}</p>}

  {query.error ? <div className="workspace-error" role="alert">{query.error.message}<button onClick={() => void query.refetch()}>Coba lagi</button></div>
   : query.isPending ? <div className="commerce-panel table-loading" role="status">Memuat produk dan varian…</div>
   : <div className="catalog-layout">
    <aside className="catalog-parents" aria-label="Produk induk">
     <div className="catalog-parent-heading"><h2>Produk induk</h2><span>{parents.length}</span></div>
     <SearchField className="catalog-parent-search" aria-label="Cari produk induk" placeholder="Cari produk induk" value={parentSearch} onChange={event => setParentSearch(event.target.value)}/>
     <button className={!parent && status !== "inactive" ? "selected" : ""} aria-pressed={!parent && status !== "inactive"} onClick={() => { setParent(""); setStatus("all"); }}>
      <span className="parent-icon"><Boxes size={17} aria-hidden="true"/></span><span><strong>Semua produk</strong><small>Seluruh varian kategori</small></span><b>{rows.length}</b>
     </button>
     <button className={!parent && status === "inactive" ? "selected" : ""} aria-pressed={!parent && status === "inactive"} onClick={() => { setParent(""); setStatus("inactive"); setSearch(""); }}>
      <span className="parent-icon"><EyeOff size={16} aria-hidden="true"/></span><span><strong>Disembunyikan</strong><small>Varian nonaktif</small></span><b>{hiddenCount}</b>
     </button>
     {matchingParents.map(product => <button key={product.slug} className={parent === product.slug ? "selected" : ""} aria-pressed={parent === product.slug} onClick={() => { setParent(product.slug); setStatus("all"); }}>
      <span className="parent-icon"><Package size={16} aria-hidden="true"/></span>
      <span><strong>{product.name}</strong><small>{product.active} aktif · {product.count} varian</small></span><ChevronRight size={14} aria-hidden="true"/>
     </button>)}
     {parentTerm && !matchingParents.length && <p className="catalog-parent-empty">Produk induk tidak ditemukan.</p>}
    </aside>
    <section className="commerce-panel catalog-variants" aria-labelledby="catalog-variants-title">
     <div className="panel-title"><div>
      <h2 id="catalog-variants-title">{selectedParent?.name || (status === "inactive" ? "Varian disembunyikan" : "Semua varian")}</h2>
      <p>{selectedParent ? `/${selectedParent.slug} · mulai ${rupiah(selectedParent.min)}` : "Lihat tujuan varian di katalog dan SKU layanan yang dipakai."}</p>
     </div><span className="subtle-text">{filtered.length} varian</span></div>
     {!query.data?.providerAvailable && <p className="workspace-feedback" role="status">Katalog provider sedang tidak tersedia. Varian tersimpan tetap dapat dikelola.</p>}
     <div className="order-toolbar catalog-variant-filters">
      <SearchField aria-label="Cari varian" placeholder="Cari varian, grup, atau SKU" value={search} onChange={event => setSearch(event.target.value)}/>
      <CustomSelect aria-label="Sumber varian" value={origin} onChange={event => setOrigin(event.target.value)}>
       <option value="all">Semua sumber</option><option value="vipayment">VIPayment</option><option value="manual">Produk sendiri</option>
      </CustomSelect>
      <CustomSelect aria-label="Status varian" value={status} onChange={event => setStatus(event.target.value)}>
       <option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Disembunyikan</option><option value="managed">Sudah diatur admin</option>
      </CustomSelect>
     </div>
     {selectedRows.length > 0 && <div className="bulk-toolbar">
      <strong>{selectedRows.length} varian dipilih</strong>
      <button disabled={!canActivate} onClick={() => void bulk(true)}><Eye size={14} aria-hidden="true"/>Tampilkan</button>
      <button disabled={!canHide} onClick={() => void bulk(false)}><EyeOff size={14} aria-hidden="true"/>Sembunyikan</button>
      <CustomSelect aria-label="Produk induk tujuan pemetaan" disabled={busy} value={mappingTarget} onChange={event => setMappingTarget(event.target.value)}>
       <option value="">Pindahkan ke produk…</option>{parents.map(product => <option key={product.slug} value={product.slug}>{product.name}</option>)}
      </CustomSelect>
      <button disabled={busy || !mappingTarget} onClick={() => void bulk(true, mappingTarget)}>Pindahkan</button>
      <button disabled={busy} onClick={() => setPicked([])}>Batal</button>
     </div>}
     <div className="commerce-table-wrap catalog-mapping-table" role="region" aria-label="Tabel pemetaan varian" tabIndex={0}>
      <table className="commerce-table product-table">
       <thead><tr>
        <th scope="col"><AdminInput type="checkbox" aria-label="Pilih semua varian pada halaman" disabled={!query.data?.canWrite || busy || !visible.length} checked={!!visible.length && visible.every(row => pickedKeys.has(variantKey(row)))} onChange={event => {
         const pageKeys = new Set(visible.map(variantKey));
         setPicked(previous => event.target.checked ? [...new Set([...previous, ...pageKeys])] : previous.filter(key => !pageKeys.has(key)));
        }}/></th>
        <th scope="col">Varian toko</th><th scope="col">Produk & grup</th><th scope="col">Layanan provider</th>
        <th scope="col" className="numeric">Harga</th><th scope="col">Publikasi</th><th scope="col"><span className="sr-only">Edit</span></th>
       </tr></thead>
       <tbody>{visible.map(row => {
        const fromProvider = row.provider === "vipayment";
        const supplier = fromProvider ? source.get(supplierCode(row)) : undefined;
        const key = variantKey(row);
        return <tr key={key}>
         <td><AdminInput type="checkbox" aria-label={`Pilih ${row.name}`} disabled={!query.data?.canWrite || busy} checked={pickedKeys.has(key)} onChange={event => setPicked(previous => event.target.checked ? [...previous, key] : previous.filter(value => value !== key))}/></td>
         <th scope="row" className="catalog-variant-cell"><button className="variant-name" onClick={() => open(row)}>{row.name}</button>
          <small>{row.managed ? "Diatur admin" : "Bawaan katalog"}{row.category === "social" && row.service_quantity ? ` · ${row.service_quantity.toLocaleString("id-ID")} unit` : ""}</small>
         </th>
         <td className="catalog-variant-cell"><strong>{row.product}</strong><small>{sectionName(row, supplier)}</small></td>
         <td className="catalog-variant-cell">
          <strong>{fromProvider ? "VIPayment" : row.provider === "manual" ? "Manual" : row.provider}</strong>
          <small>{fromProvider ? "SKU supplier" : "SKU"} <code>{supplierCode(row)}</code></small>
          {supplier && supplier.name !== row.name && <small>{supplier.name}</small>}
          {fromProvider && !supplier && <small>Data layanan belum tersedia</small>}
         </td>
         <td className="numeric"><strong>{rupiah(row.price)}</strong><small>{row.cost_price == null ? "Modal belum diisi" : `Modal ${rupiah(Number(row.cost_price))}`}</small></td>
         <td><span className={`order-status ${row.active && (!fromProvider || supplier) ? "status-completed" : "status-expired"}`}><i/>{row.active ? fromProvider && !supplier ? "Provider tidak tersedia" : "Aktif" : "Nonaktif"}</span></td>
         <td><button className="square-button" aria-label={`Kelola varian ${row.name}`} onClick={() => open(row)}><Pencil size={15} aria-hidden="true"/></button></td>
        </tr>;
       })}</tbody>
      </table>
     </div>
     {!visible.length && <div className="workspace-empty"><Package size={28} aria-hidden="true"/><h3>Varian tidak ditemukan</h3><p>Ubah pencarian atau filter untuk melihat varian lain.</p></div>}
     <div className="table-footer"><span>Menampilkan {filtered.length ? page * 25 + 1 : 0}–{Math.min((page + 1) * 25, filtered.length)} dari {filtered.length} varian</span>
      <div><button className="square-button" aria-label="Varian sebelumnya" disabled={!page} onClick={() => setPage(previous => previous - 1)}><ChevronLeft size={16} aria-hidden="true"/></button><span>{page + 1}</span><button className="square-button" aria-label="Varian berikutnya" disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage(previous => previous + 1)}><ChevronRight size={16} aria-hidden="true"/></button></div>
     </div>
    </section>
   </div>}
  <dialog ref={providerDialog} className="order-dialog provider-dialog" onCancel={() => setProviderOpen(false)} onClose={() => setProviderOpen(false)} aria-labelledby="provider-title">
   <header className="drawer-header"><div><span>{catalogCategories.find(([id]) => id === category)?.[1]}</span><h2 id="provider-title">Pemetaan VIPayment</h2></div><button className="square-button" aria-label="Tutup layanan VIPayment" onClick={() => setProviderOpen(false)}><X size={20} aria-hidden="true"/></button></header>
   <div className="drawer-content">
    {selectedParent && <p className="field-note">Varian baru akan dipetakan ke <strong>{selectedParent.name}</strong>. Tujuannya bisa diubah sebelum disimpan.</p>}
    <div className="provider-catalog-filters">
     <SearchField className="provider-search" aria-label="Cari layanan VIPayment" placeholder="Cari layanan, SKU, atau produk" value={providerSearch} onChange={event => { setProviderSearch(event.target.value); setProviderLimit(30); }}/>
     <CustomSelect aria-label="Status pemetaan VIPayment" value={providerStatus} onChange={event => { setProviderStatus(event.target.value); setProviderLimit(30); }}>
      <option value="all">Semua layanan</option><option value="unmapped">Belum masuk katalog</option><option value="mapped">Sudah masuk katalog</option>
     </CustomSelect>
    </div>
    <p className="field-note" role="status">{matchingServices.length.toLocaleString("id-ID")} layanan ditemukan</p>
    <div className="provider-service-list">{matchingServices.slice(0, providerLimit).map(item => {
     const linked = providerVariants.get(item.code) ?? [];
     return <article key={item.code} className="provider-mapping-card">
      <div className="provider-service-identity">
       <strong>{item.name}</strong>
       <small>{item.product}{item.section && item.section !== item.product ? ` · ${item.section}` : ""}</small>
       <small>SKU supplier <code>{item.code}</code>{item.requiresManualReview ? " · Pengerjaan manual" : ""}</small>
       <span>{rupiah(item.price)}{category === "social" ? " / 1.000 unit" : " harga katalog"}</span>
      </div>
      <div className="provider-mapping-targets">
       <b>{linked.length ? `${linked.length} varian di katalog` : "Belum masuk katalog"}</b>
       {linked.length > 0 && <ul>{linked.map(row => <li key={variantKey(row)}>
        <button type="button" className="variant-name" onClick={() => editProviderVariant(row)}>{row.name}<ChevronRight size={14} aria-hidden="true"/></button>
        <small>{row.product} · {sectionName(row, item)}{category === "social" && row.service_quantity ? ` · ${row.service_quantity.toLocaleString("id-ID")} unit` : ""} · {row.active ? "Aktif" : "Nonaktif"}{!row.managed ? " · Bawaan" : ""}</small>
       </li>)}</ul>}
       {(!linked.length || category === "social") && <button type="button" className="outline-button" disabled={!query.data?.canWrite || busy} onClick={() => selectProviderService(item)}>{linked.length ? "Tambah paket" : "Petakan layanan"}<ArrowRight size={14} aria-hidden="true"/></button>}
      </div>
     </article>;
    })}</div>
    {!matchingServices.length && <p className="field-note">{source.size ? "Tidak ada layanan yang cocok dengan pencarian dan filter." : "Data layanan provider belum tersedia. Perbarui katalog untuk mencoba lagi."}</p>}
    {matchingServices.length > providerLimit && <button type="button" className="outline-button" onClick={() => setProviderLimit(count => count + 30)}>Tampilkan lebih banyak</button>}
   </div>
  </dialog>
  <dialog ref={dialog} className="order-dialog product-dialog" onCancel={e=>{if(busy)e.preventDefault();else setDraft(null);}} onClose={()=>setDraft(null)} aria-labelledby="variant-title">{draft&&<><header className="drawer-header"><div><span>{draft.managed?"Kelola varian":"Atur varian"}</span><h2 id="variant-title">{draft.name || "Varian baru"}</h2></div><button className="square-button" disabled={busy} aria-label="Tutup editor varian" onClick={()=>setDraft(null)}><X size={20}/></button></header><div className="drawer-content">
   {query.data?.canWrite&&<button className="outline-button" type="button" disabled={busy} aria-haspopup="dialog" onClick={()=>setAssistantOpen(true)}><Sparkles size={16} aria-hidden="true"/>Bantu edit</button>}
   <form className="variant-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={busy || !query.data?.canWrite}>
     <legend>Pemetaan katalog</legend>
     <dl className="variant-mapping-preview">
      <div><dt>Layanan sumber</dt><dd>{draft.provider === "vipayment" ? "VIPayment" : draft.provider === "manual" ? "Produk sendiri" : draft.provider}</dd>
       {draftSupplier && <small>{draftSupplier.name}</small>}{supplierCode(draft) && <small>SKU <code>{supplierCode(draft)}</code></small>}
      </div>
      <div><dt>Tujuan di website</dt><dd>{draft.product || "Pilih produk induk"}</dd><small>{sectionName(draft, draftSupplier)}{draft.name ? ` · ${draft.name}` : ""}</small></div>
     </dl>
     <label>Produk induk tujuan<CustomSelect aria-label="Pilih produk induk" value={parents.some(product => product.slug === draft.product_slug) ? draft.product_slug : ""} onChange={event => {
      const product = parents.find(item => item.slug === event.target.value);
      setDraft({ ...draft, product: product?.name ?? "", product_slug: product?.slug ?? "" });
     }}>
      <option value="">Isi produk baru</option>{parents.map(product => <option key={product.slug} value={product.slug}>{product.name}</option>)}
     </CustomSelect></label>
     <div className="form-two-columns">
      <label>Nama produk induk<AdminInput required maxLength={100} value={draft.product} onChange={event => {
       const name = event.target.value;
       const existing = parents.find(product => product.name.toLowerCase() === name.trim().toLowerCase());
       const autoSlug = !draft.product_slug || draft.product_slug === productSlug(draft.product) || parents.some(product => product.slug === draft.product_slug);
       setDraft({ ...draft, product: name, product_slug: existing?.slug ?? (autoSlug ? productSlug(name) : draft.product_slug) });
      }}/></label>
      <label>Slug produk induk<AdminInput required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} value={draft.product_slug} onChange={event => setDraft({ ...draft, product_slug: event.target.value })}/><small>Alamat produk di katalog.</small></label>
     </div>
     <label>Grup varian<AdminInput maxLength={100} value={draft.section ?? ""} placeholder={sectionName(draft, draftSupplier)} onChange={event => setDraft({ ...draft, section: event.target.value })}/><small>Varian dengan grup yang sama ditampilkan bersama.</small></label>
     <label>Nama varian di toko<AdminInput required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
     <div className="form-two-columns">
      <label>Provider<AdminInput required maxLength={60} pattern={"[a-z0-9_\\-]+"} readOnly={draft.managed || draft.provider === "vipayment"} value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })}/></label>
      <label>SKU varian<AdminInput required maxLength={120} pattern={"[A-Za-z0-9._\\-]+"} readOnly={draft.managed || draft.provider === "vipayment"} value={draft.provider_code} onChange={event => setDraft({ ...draft, provider_code: event.target.value })}/></label>
     </div>
     <p className="field-note">{draft.provider === "vipayment" ? "SKU supplier tetap terhubung saat varian dipindahkan ke produk lain." : "Gunakan SKU unik untuk mengenali varian ini di dashboard."}</p>
    </fieldset>
    <fieldset disabled={busy||!query.data?.canWrite}><legend>Harga & publikasi</legend><label>Pemrosesan pesanan<CustomSelect aria-label="Pemrosesan pesanan" value={draft.provider==="vipayment"?(draft.fulfillment_mode || "vipayment"):"manual"} onChange={e=>setDraft({...draft,fulfillment_mode:e.target.value as "manual"|"vipayment"})}><option value="manual">Dikerjakan tim admin</option>{draft.provider==="vipayment"&&!source.get(draft.supplier_code || draft.provider_code)?.requiresManualReview&&<option value="vipayment">Otomatis melalui VIPayment</option>}</CustomSelect></label>{category==="social"&&<label>Jumlah layanan per paket<AdminInput required type="number" min={draftSupplier?.minimum ?? 1} max={draftSupplier?.maximum ?? 10000000} value={draft.service_quantity || ""} onChange={e=>changeQuantity(Number(e.target.value))} aria-invalid={duplicateSocialPackage} aria-describedby={duplicateSocialPackage ? "duplicate-social-package" : undefined}/>{duplicateSocialPackage ? <small id="duplicate-social-package" role="status">Jumlah ini sudah dipakai untuk SKU supplier yang sama. Masukkan jumlah lain atau buka paket yang sudah tersimpan.</small> : <small>Harga jual berlaku untuk jumlah unit ini.</small>}</label>}<label>Harga jual (Rp)<AdminInput aria-label="Harga jual (Rp)" required type="number" min={1} max={100000000} step={1} value={draft.price||""} onChange={e=>setDraft({...draft,price:Number(e.target.value)})}/>{draft.sourcePrice!==undefined&&<small>Harga katalog awal: {rupiah(draft.sourcePrice)}{category === "social" ? " / 1.000 unit" : ""}</small>}</label><label>Harga modal (Rp)<AdminInput aria-label="Harga modal (Rp)" type="number" min={0} max={100000000} step={1} value={draft.cost_price ?? ""} placeholder="Belum diisi" onChange={e=>setDraft({...draft,cost_price:e.target.value===""?null:Number(e.target.value)})}/><small>{draft.provider==="vipayment"?"Otomatis dari harga supplier; dapat diubah untuk laporan keuntungan.":"Isi biaya nyata untuk menghitung keuntungan. Kosong berarti belum diketahui."}</small></label><label>Deskripsi varian<AdminTextarea maxLength={2000} rows={4} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label className="switch-label"><AdminInput type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/><span><strong>Tampilkan di website</strong><small>Varian nonaktif disembunyikan dari katalog dan checkout.</small></span></label><button className="primary-button" type="submit" disabled={busy||!query.data?.canWrite||duplicateSocialPackage}>{busy?"Menyimpan…":"Simpan varian"}<ArrowRight size={16}/></button></fieldset></form>{draft.category==="tasks"&&draft.managed&&<TaskPricingEditor key={draft.id} productId={draft.id} basePrice={draft.price} canWrite={!!query.data?.canWrite}/>}{draft.category==="apps"&&draft.managed&&<PremiumRulesEditor productId={draft.id}/>}<section className="variant-promotion">{(draft.managed||draft.sourcePrice!==undefined)&&<div><h3>Hapus varian</h3><p className="field-note">Varian dihapus dari daftar dan website. Pesanan yang sudah dibuat tetap tersimpan.</p>{confirmRemove?<><p role="alert">Hapus varian {draft.name}?</p><button className="outline-button" disabled={busy||!query.data?.canWrite} onClick={()=>void remove()}>Ya, hapus varian</button> <button className="outline-button" disabled={busy} onClick={()=>setConfirmRemove(false)}>Batal</button></>:<button className="outline-button" disabled={busy||!query.data?.canWrite} onClick={()=>setConfirmRemove(true)}><Trash2 size={15}/>Hapus varian</button>}</div>}<h3>Promo varian</h3>{draft.category==="tasks"?<p className="field-note">Kelola harga Joki Tugas dari aturan tarif varian.</p>:!draft.active||(!draft.managed&&draft.provider!=="vipayment")?<p className="field-note">Simpan dan aktifkan varian terlebih dahulu untuk mengatur promo.</p>:promos.error?<p role="alert" className="field-note">{promos.error.message}</p>:<form className="variant-form" onSubmit={e=>{e.preventDefault();void savePromo();}}><fieldset disabled={busy||!query.data?.canWrite}><label>Harga promo (Rp)<AdminInput required type="number" min={1} max={draft.price-1} value={promotion.sale_price||""} onChange={e=>setPromotion({...promotion,sale_price:Number(e.target.value)})}/></label><label>Mulai (waktu perangkat)<AdminInput required type="datetime-local" value={promotion.starts_at} onChange={e=>setPromotion({...promotion,starts_at:e.target.value})}/></label><label>Selesai (waktu perangkat)<AdminInput required type="datetime-local" value={promotion.ends_at} onChange={e=>setPromotion({...promotion,ends_at:e.target.value})}/></label><label className="switch-label"><AdminInput type="checkbox" checked={promotion.active} onChange={e=>setPromotion({...promotion,active:e.target.checked})}/><span>Aktifkan jadwal promo</span></label><button className="outline-button" type="submit" disabled={busy||!query.data?.canWrite}>Simpan promo</button></fieldset></form>}</section>{formMessage&&<p className="workspace-feedback" role="status">{formMessage}</p>}</div></>}</dialog>

  {assistantOpen&&draft&&query.data?.canWrite&&<AssistantVariantPanel
    variant={draft}
    activePromoPrice={activePromoPrice}
    onClose={()=>setAssistantOpen(false)}
    onAiApplied={published=>{
      setAssistantOpen(false);
      setDraft(null);
      setMessage(published?"Perubahan AI disimpan. Publikasi katalog admin aktif.":"Perubahan AI disimpan. Publikasi katalog admin belum aktif.");
    }}
    onApply={fields=>{
      setDraft(current=>current?{...current,...fields}:current);
      setFormMessage("Perubahan dimasukkan ke editor. Pilih Simpan varian untuk menyimpan.");
    }}
  />}
 </div>;

}
