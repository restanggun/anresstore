"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminRequest } from "./workspace-api";

type Rule={price_per_page:number;price_per_revision:number;rush_fee_per_day:number;standard_days:number;max_pages:number;max_revisions:number};
const initial:Rule={price_per_page:0,price_per_revision:0,rush_fee_per_day:0,standard_days:7,max_pages:100,max_revisions:3};

export function TaskPricingEditor({productId,basePrice}:{productId:string;basePrice:number}){
 const query=useQuery({queryKey:["task-pricing",productId],queryFn:()=>adminRequest(`task-pricing/${productId}`) as Promise<{rule:Rule|null}>});
 const [draft,setDraft]=useState<Rule>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{if(query.data)setDraft(query.data.rule??initial)},[query.data]);
 const fields:[keyof Rule,string,number,number][]=[
  ["price_per_page","Tambahan per halaman (Rp)",0,1000000],
  ["price_per_revision","Harga per revisi (Rp)",0,1000000],
  ["rush_fee_per_day","Biaya percepatan per hari (Rp)",0,1000000],
  ["standard_days","Tenggat standar (hari)",1,90],
  ["max_pages","Maksimal halaman",1,500],
  ["max_revisions","Maksimal revisi",0,20],
 ];
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage("");try{await adminRequest(`task-pricing/${productId}`,"POST",draft);setMessage("Tarif joki disimpan. Kutipan baru memakai aturan ini.");await query.refetch();}catch(error){setMessage(error instanceof Error?error.message:"Tarif gagal disimpan.")}finally{setBusy(false)}}
 return <section className="variant-promotion"><h3>Tarif joki tugas</h3><p className="field-note">Harga dasar varian Rp{basePrice.toLocaleString("id-ID")} ditambah halaman, revisi, dan biaya percepatan jika tenggat lebih pendek dari standar.</p>{query.isPending?<p role="status">Memuat tarif...</p>:query.error?<p role="alert">{query.error.message}</p>:<form className="variant-form" onSubmit={event=>void save(event)}><fieldset disabled={busy}>{fields.map(([key,label,min,max])=><label key={key}>{label}<input required type="number" min={min} max={max} step={1} value={draft[key]} onChange={event=>setDraft({...draft,[key]:Number(event.target.value)})}/></label>)}<button className="outline-button" type="submit" disabled={busy}>{busy?"Menyimpan...":"Simpan tarif joki"}</button></fieldset></form>}{message&&<p role="status" className="workspace-feedback">{message}</p>}</section>;
}
