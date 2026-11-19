"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import { adminRequest } from "./workspace-api";
import styles from "./review-workspace.module.css";

type ReviewStatus = "pending" | "published" | "hidden" | "rejected";
type Review = {
  id: string; category: string; product_slug: string; invoice_id: string | null; purchase_verified: boolean; rating: number; comment: string;
  reviewer_email: string; reviewer_user_id: string | null; status: ReviewStatus;
  created_at: string; updated_at: string;
};
const statuses: [ReviewStatus, string][] = [["pending","Menunggu tinjauan"],["published","Tampilkan"],["hidden","Sembunyikan"],["rejected","Tolak"]];
const categories: [string,string][] = [["game","Top up game"],["prepaid","PPOB"],["apps","Aplikasi premium"],["social","Media sosial"],["tasks","Joki tugas"]];
const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle:"medium", timeStyle:"short" });

function ReviewCard({ row, busy, save, remove }: {
  row: Review; busy: boolean; save: (id: string, patch: { status: ReviewStatus; rating: number; comment: string }) => Promise<void>;
  remove: (row: Review) => Promise<void>;
}) {
  const [status,setStatus] = useState<ReviewStatus>(row.status);
  const [rating,setRating] = useState(row.rating);
  const [comment,setComment] = useState(row.comment);
  const category = categories.find(([value])=>value===row.category)?.[1] ?? row.category;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(row.id,{status,rating,comment});
  }
  return <article className={styles.card}>
    <header className={styles.cardHead}>
      <div><strong>{row.product_slug}</strong><span>{category} · {row.reviewer_user_id ? "Akun" : "Guest"}{row.purchase_verified && row.invoice_id ? " · Invoice terverifikasi" : " · Tanpa bukti invoice"}</span></div>
      <time dateTime={row.created_at}>{dateLabel.format(new Date(row.created_at))}</time>
    </header>
    <p className={styles.email}>{row.reviewer_email}</p>
    <form onSubmit={submit} className={styles.form}>
      <label>Status<select name="status" value={status} disabled={busy} onChange={event=>setStatus(event.target.value as ReviewStatus)}>
      {statuses.map(([value,label])=><option key={value} value={value} disabled={value === "published" && (!row.purchase_verified || !row.invoice_id)}>{label}</option>)}
      </select></label>
      <fieldset className={styles.ratingField} disabled={busy}><legend>Rating</legend><div>
        {[1,2,3,4,5].map(value=><label key={value} className={value<=rating?styles.ratingActive:""}>
          <input type="radio" name={`rating-${row.id}`} value={value} checked={rating===value}
            aria-label={`${value} bintang`} onChange={()=>setRating(value)}/>
          <Star size={21} strokeWidth={1.8} fill={value<=rating?"currentColor":"none"} aria-hidden="true"/>
        </label>)}
      </div><small>{rating} dari 5 bintang</small></fieldset>
      <label className={styles.commentField}>Komentar<textarea name="comment" required minLength={5} maxLength={1000} rows={4}
        value={comment} disabled={busy} onChange={event=>setComment(event.target.value)}/></label>
      <div className={styles.actions}>
        <button type="submit" className="primary-button" disabled={busy||comment.trim().length<5}>Simpan perubahan</button>
        <button type="button" className="outline-button" disabled={busy} onClick={()=>void remove(row)}><Trash2 size={14} aria-hidden="true"/>Hapus ulasan</button>
      </div>
    </form>
  </article>;
}

export function ReviewWorkspace() {
  const client=useQueryClient();
  const [page,setPage]=useState(0);
  const [status,setStatus]=useState("pending");
  const [category,setCategory]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const list=useQuery({queryKey:["product-reviews",page,status,category],
    queryFn:()=>adminRequest(`reviews?page=${page}&status=${status}${category?`&category=${category}`:""}`) as Promise<{rows:Review[];hasMore:boolean}>});

  async function refresh(message: string) {
    await client.invalidateQueries({queryKey:["product-reviews"]});
    setNotice(message);
  }
  async function save(id:string,patch:{status:ReviewStatus;rating:number;comment:string}) {
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try { await adminRequest(`reviews/${id}`,"PATCH",patch); await refresh("Ulasan berhasil diperbarui."); }
    catch(cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(row:Review) {
    if(busy||!window.confirm(`Hapus ulasan ${row.product_slug} dari ${row.reviewer_email}? Tindakan ini tidak dapat dibatalkan.`))return;
    setBusy(true);setError("");setNotice("");
    try { await adminRequest(`reviews/${row.id}`,"DELETE"); await refresh("Ulasan dihapus."); }
    catch(cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <div className={styles.workspace}>
    <div className="workspace-heading"><div><h1>Rating & ulasan</h1><p>Tinjau komentar pelanggan sebelum ditampilkan di halaman produk.</p></div></div>
    {error&&<p className="workspace-error" role="alert">{error}</p>}
    {notice&&<p className="workspace-feedback" role="status">{notice}</p>}
    <section className="commerce-panel" aria-label="Daftar ulasan produk">
      <div className={styles.filters}>
        <label>Status<select value={status} onChange={event=>{setPage(0);setStatus(event.target.value);}}>
          <option value="pending">Menunggu tinjauan</option><option value="published">Tampil publik</option>
          <option value="hidden">Disembunyikan</option><option value="rejected">Ditolak</option><option value="all">Semua status</option>
        </select></label>
        <label>Kategori<select value={category} onChange={event=>{setPage(0);setCategory(event.target.value);}}>
          <option value="">Semua kategori</option>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {list.isPending&&<p className={styles.empty} role="status">Memuat ulasan…</p>}
      {list.error&&<p className="workspace-error" role="alert">{list.error.message}</p>}
      {list.data&&<>
        {!list.data.rows.length?<p className={styles.empty}>Belum ada ulasan pada filter ini.</p>:
          <div className={styles.cards}>{list.data.rows.map(row=><ReviewCard key={row.id} row={row} busy={busy} save={save} remove={remove}/>)}</div>}
        {(page>0||list.data.hasMore)&&<div className="table-footer"><span>Halaman {page+1}</span><div>
          <button type="button" className="outline-button" disabled={!page||busy} onClick={()=>setPage(page-1)}>Sebelumnya</button>
          <button type="button" className="outline-button" disabled={!list.data?.hasMore||busy} onClick={()=>setPage(page+1)}>Berikutnya</button>
        </div></div>}
      </>}
    </section>
  </div>;
}
