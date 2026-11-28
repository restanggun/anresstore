"use client";
import { AdminDrawer } from "./admin-drawer";
import { SearchField, SearchSubmit } from "@anres/ui";
import { AdminTextarea } from "./form-controls";
import { CreateInvoiceDialog, InvoiceActions } from "./invoice-actions";

import { CustomSelect } from "./custom-select";

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { RefreshCw, Plus, ArrowRight, ChevronLeft, ChevronRight, X, Copy, ShoppingBag, ShieldAlert } from "lucide-react";

import { adminRequest, rupiah, stateLabel } from "./workspace-api";

type Order={id:string;invoice_number:string|null;created_at:string;updated_at:string|null;category:string;product_name:string;provider_code:string;target:string;target_zone:string|null;amount:number;payment_method?:string;payment_reference?:string|null;payment_mode:string;payment_status:string;fulfillment_status:string;provider_reference:string|null;provider_note:string|null;review_required:boolean;fulfillment_mode?:string;service_quantity?:number;customer_name?:string;customer_email?:string;customer_phone?:string;manual_kind?:string;source:"checkout"|"premium"|"historical"};

const date=(v:string)=>new Date(v).toLocaleString("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});

export function StatusBadge({value,manual=false}:{value:string;manual?:boolean}){return <span className={`order-status status-${value}`}><i/>{manual&&value==="ready"?"Menunggu pengerjaan":manual&&value==="processing"?"Sedang dikerjakan":stateLabel(value)}</span>;}

export function OrderWorkspace({compact=false,view="orders",initialStatus,onViewAll,unreadIds,onReadItem}:{compact?:boolean;view?:"orders"|"payments"|"fulfillment";initialStatus?:string;onViewAll?:()=>void;unreadIds?:ReadonlySet<string>;onReadItem?:(id:string)=>void}){

 const [page,setPage]=useState(0),[search,setSearch]=useState(""),[searchTerm,setSearchTerm]=useState(""),[tab,setTab]=useState(initialStatus??(view==="fulfillment"?"active":"all")),[selected,setSelected]=useState<Order|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");

 const [creating,setCreating]=useState(false),[resultNotice,setResultNotice]=useState("");
 const [manualStatus,setManualStatus]=useState("processing"),[manualNote,setManualNote]=useState("");
 const dialog=useRef<HTMLDialogElement>(null),client=useQueryClient();

 const params=new URLSearchParams({page:String(page),status:tab,search:searchTerm});
 const query=useQuery({queryKey:["order-records",view,page,tab,searchTerm],queryFn:()=>adminRequest(`transaction-records/${view}?${params}`) as Promise<{rows:Order[];hasMore:boolean;canManageInvoices:boolean}>,refetchInterval:15000,refetchOnWindowFocus:true});

 const rows=query.data?.rows || [];

 const visible=compact?rows.slice(0,5):rows;

 const current=rows.find(r=>r.id===selected?.id&&r.source===selected?.source)||selected;

 function openOrder(row:Order){if(unreadIds?.has(row.id))onReadItem?.(row.id);setSelected(row);setMessage("");}

 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();if(!selected&&dialog.current?.open)dialog.current.close();},[selected]);

 async function saveManual(){if(!current||current.manual_kind)return;setBusy(true);setMessage("");try{await adminRequest(`fulfillment/${current.id}/manual`,"PATCH",{status:manualStatus,note:manualNote});await client.invalidateQueries({queryKey:["order-records"]});await client.invalidateQueries({queryKey:["analytics"]});setMessage("Status pengerjaan disimpan.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const paymentTabs: [string,string][]=[["pending","Menunggu bayar"],["paid","Lunas"],["failed","Gagal / batal"],["refunded","Dikembalikan"],["unknown","Belum pasti"]];
 const fulfillmentTabs: [string,string][]=[["active","Diproses"],["review","Perlu tinjauan"],["completed","Selesai"]];
 const tabs: [string,string][]=[["all","Semua"],...(view==="fulfillment"?fulfillmentTabs:view==="payments"?paymentTabs:[...paymentTabs,...fulfillmentTabs])];

 async function review(){if(!current)return;setBusy(true);setMessage("");try{await adminRequest(`fulfillment/${current.id}/review`,"PATCH",{review:!current.review_required});await client.invalidateQueries({queryKey:["order-records"]});await client.invalidateQueries({queryKey:["analytics"]});setMessage("Status tinjauan diperbarui.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}

 return <div className="order-workspace">

  {!compact&&<div className="workspace-heading"><div><h1>{view==="payments"?"Pembayaran":view==="fulfillment"?"Antrean pemenuhan":"Pesanan & invoice"}</h1><p>{view==="payments"?"Periksa nilai, referensi, dan status pembayaran pesanan.":view==="fulfillment"?"Awasi antrean pengiriman dan tangani pesanan bermasalah.":"Telusuri setiap pesanan, dari pembayaran sampai pengiriman."}</p></div><div className="heading-actions">{view==="orders"&&query.data?.canManageInvoices&&<button type="button" className="primary-button" onClick={()=>setCreating(true)}><Plus size={15} aria-hidden="true"/>Buat transaksi</button>}<button className="outline-button" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={15}/>Perbarui</button></div></div>}

  {creating&&<CreateInvoiceDialog onClose={()=>setCreating(false)} onCreated={number=>{setCreating(false);setSearch(number);setSearchTerm(number);setPage(0);setTab("all");setResultNotice("Transaksi "+number+" dibuat.");}}/>}
  {resultNotice&&<p className="workspace-feedback" role="status">{resultNotice}</p>}
  <section className="commerce-panel orders-panel"><div className="panel-title"><div><h2>{compact?"Pesanan terbaru":view==="payments"?"Daftar pembayaran":"Daftar pesanan"}</h2><p>{compact?"Aktivitas terakhir dari website":"Status tersinkron otomatis setiap 15 detik"}</p></div>{compact?<button className="inline-link" onClick={onViewAll}>Lihat semua<ArrowRight size={15}/></button>:<span className="subtle-text">Waktu Indonesia Barat</span>}</div>

  {!compact&&<>
   <div className="order-tabs" role="group" aria-label="Filter status transaksi">
    {tabs.map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setPage(0);setSelected(null);}}>{label}</button>)}
   </div>
   <form className="order-toolbar transaction-search-toolbar" role="search" onSubmit={e=>{e.preventDefault();setSearchTerm(search.trim());setPage(0);setSelected(null);}}>
    <SearchField aria-label="Cari transaksi" placeholder="Cari invoice, produk, atau tujuan" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}><SearchSubmit label="Cari transaksi"/></SearchField>
    {searchTerm&&<button type="button" className="outline-button" onClick={()=>{setSearch("");setSearchTerm("");setPage(0);setSelected(null);}}>Hapus pencarian</button>}
   </form>
  </>}

  {query.error?<div className="workspace-error" role="alert">{query.error.message}<button onClick={()=>void query.refetch()}>Coba lagi</button></div>:query.isPending?<div className="table-loading" role="status">Memuat pesanan…</div>:<>{visible.length>0&&<div className="commerce-table-wrap"><table className="commerce-table order-table"><thead><tr><th scope="col">Invoice / produk</th>{!compact&&<th scope="col">{view==="payments"?"Referensi pembayaran":"Tujuan"}</th>}<th scope="col" className="numeric">Nominal</th><th scope="col">Pembayaran</th><th scope="col">Pemrosesan</th><th scope="col"><span className="sr-only">Detail</span></th></tr></thead><tbody>{visible.map(r=><tr key={r.source + ":" + r.id} className={unreadIds?.has(r.id)?"is-unread":undefined}><td><button className="invoice-link" onClick={()=>openOrder(r)}>{r.invoice_number ?? "Penjualan historis"}</button><strong className="order-product">{r.product_name}</strong>{unreadIds?.has(r.id)&&<span className="sr-only">Pesanan belum dibaca.</span>}<small>{date(r.created_at)} <span className={`mode-tag ${r.payment_mode}`}>{r.source==="historical"?"Riwayat QRIS":"Produksi"}</span></small></td>{!compact&&<td><span className="order-target">{view==="payments"?(r.payment_reference || "Belum diterima"):r.target}</span>{view==="payments"?<small>{r.payment_method==="MANUAL_QRIS"?"QRIS manual":r.payment_method || "?"}</small>:r.target_zone&&<small>Server {r.target_zone}</small>}</td>}<td className="numeric"><strong>{rupiah(Number(r.amount))}</strong>{view==="payments"&&<small>{r.payment_method==="MANUAL_QRIS"?"QRIS manual":r.payment_method || "—"}</small>}</td><td><StatusBadge value={r.payment_status}/></td><td><StatusBadge value={r.fulfillment_status} manual={r.fulfillment_mode==="manual"}/>{r.review_required&&<small className="review-label">Ditandai untuk tinjauan</small>}</td><td><button className="square-button" aria-label={`Detail transaksi ${r.invoice_number ?? r.product_name}`} onClick={()=>openOrder(r)}><ArrowRight size={16}/></button></td></tr>)}</tbody></table></div>}{!visible.length&&<div className="workspace-empty"><ShoppingBag size={29}/><h3>{tab!=="all"||searchTerm?"Tidak ada transaksi yang cocok":"Belum ada transaksi"}</h3><p>{tab!=="all"||searchTerm?"Coba kata kunci atau status lain.":"Transaksi yang tercatat akan muncul di sini."}</p>{(tab!=="all"||searchTerm)&&<button className="outline-button" onClick={()=>{setSearch("");setSearchTerm("");setTab("all");setPage(0);}}>Reset filter</button>}</div>}</>}

  {!compact&&<div className="table-footer"><span>{rows.length} transaksi pada halaman ini</span><div><button className="square-button" aria-label="Halaman sebelumnya" disabled={!page||query.isFetching} onClick={()=>{setPage(p=>p-1);setSelected(null);}}><ChevronLeft size={16}/></button><span>Halaman {page+1}</span><button className="square-button" aria-label="Halaman berikutnya" disabled={!query.data?.hasMore||query.isFetching} onClick={()=>{setPage(p=>p+1);setSelected(null);}}><ChevronRight size={16}/></button></div></div>}

  </section>

  <AdminDrawer ref={dialog} className="order-dialog" onClose={()=>setSelected(null)} aria-labelledby="order-detail-title">{current&&<><header className="drawer-header"><div><span>Detail pesanan</span><h2 id="order-detail-title">{current.invoice_number ?? "Penjualan historis"}</h2></div><button className="square-button" aria-label="Tutup detail pesanan" onClick={()=>setSelected(null)}><X size={20}/></button></header><div className="drawer-content">{current.manual_kind&&<button className="primary-button manual-order-entry" onClick={()=>{window.dispatchEvent(new CustomEvent("anres-open-manual-order",{detail:{section:current.manual_kind==="premium"?"apps":"tasks"}}));setSelected(null)}}>Buka penanganan khusus</button>}<div className="detail-product"><span className="detail-product-icon"><ShoppingBag size={25}/></span><div><h3>{current.product_name}</h3><p>{current.category==="game"?"Top up game":current.category==="prepaid"?"PPOB":current.category==="social"?"Sosmed":current.category==="tasks"?"Joki tugas":"App premium"} · {current.provider_code}</p></div><strong>{rupiah(Number(current.amount))}</strong></div><div className="detail-status-grid"><div><span>Pembayaran</span><StatusBadge value={current.payment_status}/></div><div><span>{current.fulfillment_mode==="manual"?"Pengerjaan":"Pengiriman"}</span><StatusBadge value={current.fulfillment_status} manual={current.fulfillment_mode==="manual"}/></div></div>{query.data?.canManageInvoices&&current.source!=="historical"&&current.invoice_number&&<InvoiceActions key={current.id} order={current} onArchive={()=>{setResultNotice(`Pesanan ${current.invoice_number} dihapus dari daftar.`);setSelected(null);}}/>}<section className="detail-section"><h3>Informasi pesanan</h3><dl><div><dt>Nomor invoice</dt><dd className="copy-value"><span>{current.invoice_number ?? "Penjualan historis"}</span>{current.invoice_number&&<button className="square-button" aria-label="Salin nomor invoice" onClick={async()=>{try{await navigator.clipboard.writeText(current.invoice_number!);setMessage("Nomor invoice disalin.");}catch{setMessage("Pilih dan salin nomor invoice secara manual.");}}}><Copy size={14}/></button>}</dd></div><div><dt>Dibuat</dt><dd>{date(current.created_at)} WIB</dd></div><div><dt>Diperbarui</dt><dd>{current.updated_at ? `${date(current.updated_at)} WIB` : "?"}</dd></div><div><dt>Mode transaksi</dt><dd>{current.source==="historical"?"Riwayat QRIS":"Produksi"}</dd></div></dl></section>{(current.customer_name||current.customer_email||current.customer_phone)&&<section className="detail-section"><h3>Kontak pelanggan</h3><dl><div><dt>Nama</dt><dd>{current.customer_name || "—"}</dd></div><div><dt>Email</dt><dd>{current.customer_email || "?"}</dd></div><div><dt>WhatsApp</dt><dd>{current.customer_phone || "?"}</dd></div></dl></section>}<section className="detail-section"><h3>Tujuan / kebutuhan layanan</h3><dl><div><dt>ID / nomor tujuan</dt><dd>{current.target}</dd></div>{current.target_zone&&<div><dt>Server / zona</dt><dd>{current.target_zone}</dd></div>}</dl></section><section className="detail-section"><h3>Pembayaran</h3><dl><div><dt>Metode</dt><dd>{current.payment_method==="MANUAL_QRIS"?"QRIS manual":current.payment_method || "Belum tersedia"}</dd></div>{current.payment_method!=="MANUAL_QRIS"&&<div><dt>Referensi gateway</dt><dd>{current.payment_reference || "Belum diterima"}</dd></div>}<div><dt>Total transaksi</dt><dd><strong>{rupiah(Number(current.amount))}</strong></dd></div></dl></section><section className="detail-section"><h3>Hasil provider</h3><dl><div><dt>Referensi provider</dt><dd>{current.provider_reference || "Belum tersedia"}</dd></div><div><dt>Keterangan</dt><dd>{current.provider_note || "Belum ada keterangan dari provider."}</dd></div></dl></section>{current.fulfillment_mode==="manual"&&!current.manual_kind&&<section className="detail-section"><h3>Pengerjaan tim admin</h3><p className="field-note">Paket ini diproses tim setelah pembayaran terverifikasi. Status pembayaran tidak dapat diubah dari sini.</p><form className="variant-form" onSubmit={e=>{e.preventDefault();void saveManual();}}><fieldset disabled={busy||current.payment_status!=="paid"||current.payment_mode!=="live"||["completed","failed"].includes(current.fulfillment_status)}><label>Status pengerjaan<CustomSelect aria-label="Status pengerjaan" value={manualStatus} onChange={e=>setManualStatus(e.target.value)}><option value="processing">Sedang dikerjakan</option><option value="completed">Selesai</option><option value="failed">Gagal</option></CustomSelect></label><label>Catatan untuk pelanggan<AdminTextarea required maxLength={2000} value={manualNote} onChange={e=>setManualNote(e.target.value)} placeholder="Tulis hasil atau perkembangan pekerjaan. Jangan masukkan kata sandi."/></label><button className="primary-button" type="submit">Simpan pengerjaan</button></fieldset></form></section>}{current.source==="checkout"&&!current.manual_kind&&<section className="review-box"><ShieldAlert size={19}/><div><h3>{current.review_required?"Dalam tinjauan manual":"Tinjauan pesanan"}</h3><p>Pembayaran diperbarui oleh gateway. Cocokkan hasil provider sebelum melepaskan pesanan dari tinjauan.</p><button className="outline-button" disabled={busy||current.payment_status!=="paid"||current.payment_mode!=="live"} onClick={()=>void review()}>{busy?"Menyimpan…":current.review_required?"Lepaskan dari tinjauan":"Tandai perlu tinjauan"}</button></div></section>}{message&&<p className="workspace-feedback" role="status">{message}</p>}</div></>}</AdminDrawer>

 </div>;

}
