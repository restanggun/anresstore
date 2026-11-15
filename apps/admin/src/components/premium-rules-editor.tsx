"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminRequest } from "./workspace-api";
import { CustomSelect } from "./custom-select";

type Rule={access_type:"private"|"sharing"|"other";duration_days:number;guarantee_days:number;guarantee_terms:string};
const initial:Rule={access_type:"private",duration_days:30,guarantee_days:7,guarantee_terms:"Garansi berlaku untuk gangguan akses yang bukan akibat perubahan data akun oleh pelanggan."};
export function PremiumRulesEditor({productId}:{productId:string}){
 const query=useQuery({queryKey:["premium-rules",productId],queryFn:()=>adminRequest(`premium-rules/${productId}`) as Promise<{rule:Rule|null}>});
 const [draft,setDraft]=useState<Rule>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{if(query.data)setDraft(query.data.rule??initial)},[query.data]);
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage("");try{await adminRequest(`premium-rules/${productId}`,"POST",draft);setMessage("Ketentuan aplikasi disimpan.");await query.refetch()}catch(error){setMessage(error instanceof Error?error.message:"Ketentuan gagal disimpan.")}finally{setBusy(false)}}
 return <section className="variant-promotion"><h3>Jenis akses, durasi, dan garansi</h3>{query.isPending?<p role="status">Memuat ketentuan...</p>:query.error?<p role="alert">{query.error.message}</p>:<form className="variant-form" onSubmit={event=>void save(event)}><fieldset disabled={busy}><label>Jenis akses<CustomSelect value={draft.access_type} onChange={event=>setDraft({...draft,access_type:event.target.value as Rule["access_type"]})}><option value="private">Private</option><option value="sharing">Sharing</option><option value="other">Lainnya</option></CustomSelect></label><label>Durasi akses (hari)<input required type="number" min={1} max={730} value={draft.duration_days} onChange={event=>setDraft({...draft,duration_days:Number(event.target.value)})}/></label><label>Garansi sejak akun dikirim (hari)<input required type="number" min={0} max={365} value={draft.guarantee_days} onChange={event=>setDraft({...draft,guarantee_days:Number(event.target.value)})}/></label><label>Ketentuan klaim<textarea required minLength={10} maxLength={2000} value={draft.guarantee_terms} onChange={event=>setDraft({...draft,guarantee_terms:event.target.value})}/></label><button className="outline-button" type="submit" disabled={busy}>{busy?"Menyimpan...":"Simpan ketentuan"}</button></fieldset></form>}{message&&<p role="status" className="workspace-feedback">{message}</p>}</section>;
}
