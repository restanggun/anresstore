"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRequest } from "./workspace-api";
import { AdminInput, AdminTextarea } from "./form-controls";
import styles from "./campaign-workspace.module.css";
type Template={id:string;name:string;ends_at:string;kind:string;value:number};
type Referral={id:string;referrer_user_id:string;referred_user_id:string;status:string;created_at:string;qualified_at:string|null;qualifying_invoice_id:string|null;qualifyingInvoice:{id:string;invoice_number:string;product_name:string;amount:number;created_at:string}|null};
type Mission={id:string;title:string;description:string};
type Config={title:string;description:string;startsAt:string|null;endsAt:string|null;minReferralAmount:number;referrerVoucherTemplate:string|null;friendVoucherTemplate:string|null;missions:Mission[]};
type Data={settings:{revision:number;enabled:boolean;config:Config}|null;templates:Template[];referrals:Referral[]};
const missionIds=["verified_email","first_completed_order","referral_rewarded"];
const localDate=(value:string|null)=>{if(!value)return "";const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));const get=(key:string)=>parts.find(part=>part.type===key)?.value??"";return get("year")+"-"+get("month")+"-"+get("day")+"T"+get("hour")+":"+get("minute")};
const isoDate=(value:string)=>{if(!value)return null;const d=new Date(value+":00+07:00");return Number.isFinite(d.getTime())?d.toISOString():null};
const labels:Record<string,string>={pending_verification:"Menunggu verifikasi email",active:"Aktif",qualified:"Menunggu tinjauan admin",rewarded:"Voucher diterbitkan",rejected:"Ditolak"};
export function CampaignWorkspace(){
 const client=useQueryClient();const [notice,setNotice]=useState("");const [error,setError]=useState("");
 const query=useQuery({queryKey:["grand-opening-campaign"],queryFn:({signal})=>adminRequest("campaign","GET",undefined,signal) as Promise<Data>,retry:false});
 const [draft,setDraft]=useState<{revision:number;enabled:boolean;config:Config}|null>(null);
 const save=useMutation({mutationFn:()=>adminRequest("campaign","POST",draft),onSuccess:async()=>{setNotice("Campaign berhasil disimpan.");setError("");setDraft(null);await client.invalidateQueries({queryKey:["grand-opening-campaign"]});},onError:cause=>setError((cause as Error).message)});
 const review=useMutation({mutationFn:({id,approve}:{id:string;approve:boolean})=>adminRequest("referrals/"+id,"PATCH",{approve}),onSuccess:async()=>{setNotice("Keputusan referral tersimpan.");setError("");await client.invalidateQueries({queryKey:["grand-opening-campaign"]});},onError:cause=>setError((cause as Error).message)});
 const data=query.data;
 if(query.isPending)return <p role="status">Memuat pengaturan campaign…</p>;
 if(query.error||!data?.settings)return <p className={styles.error} role="alert">{query.error?.message||"Terapkan migrasi campaign terlebih dahulu."}</p>;
 const value=draft??data.settings;
 const update=(patch:Partial<Config>)=>setDraft({...value,config:{...value.config,...patch}});
 const changeMission=(id:string,patch:Partial<Mission>)=>update({missions:value.config.missions.map(m=>m.id===id?{...m,...patch}:m)});
 const submit=(event:React.FormEvent)=>{event.preventDefault();setError("");setNotice("");save.mutate();};
 return <div className={styles.workspace}>
  <div className="workspace-heading"><div><h1>Misi & referral grand opening</h1><p>Atur periode, hadiah voucher, serta verifikasi referral sebelum reward dibagikan.</p></div></div>
  {error&&<p className="workspace-error" role="alert">{error}</p>}{notice&&<p className="workspace-feedback" role="status">{notice}</p>}
  <form className={`commerce-panel ${styles.formPanel}`} onSubmit={submit}>
   <div className={styles.switch}><AdminInput id="campaign-enabled" name="enabled" type="checkbox" checked={value.enabled} onChange={event=>setDraft({...value,enabled:event.target.checked})}/><label htmlFor="campaign-enabled">Aktifkan campaign</label><span>Campaign tetap mengikuti tanggal mulai dan selesai.</span></div>
   <div className={styles.grid}>
    <label className={styles.field} htmlFor="campaign-title">Judul campaign<AdminInput id="campaign-title" name="title" required minLength={3} maxLength={90} value={value.config.title} onChange={event=>update({title:event.target.value})}/></label>
    <label className={styles.field} htmlFor="campaign-description">Deskripsi<AdminTextarea id="campaign-description" name="description" required maxLength={400} rows={3} value={value.config.description} onChange={event=>update({description:event.target.value})}/></label>
    <label className={styles.field} htmlFor="campaign-start">Mulai (WIB)<AdminInput id="campaign-start" name="startsAt" type="datetime-local" value={localDate(value.config.startsAt)} onChange={event=>update({startsAt:isoDate(event.target.value)})}/></label>
    <label className={styles.field} htmlFor="campaign-end">Selesai (WIB)<AdminInput id="campaign-end" name="endsAt" type="datetime-local" value={localDate(value.config.endsAt)} onChange={event=>update({endsAt:isoDate(event.target.value)})}/></label>
    <label className={styles.field} htmlFor="campaign-minimum">Minimum transaksi referral (Rp)<AdminInput id="campaign-minimum" name="minReferralAmount" type="number" min={0} max={100000000} step={1000} required value={value.config.minReferralAmount} onChange={event=>update({minReferralAmount:Number(event.target.value)})}/></label>
    {(["referrerVoucherTemplate","friendVoucherTemplate"] as const).map((key,index)=><label className={styles.field} key={key} htmlFor={"campaign-voucher-"+index}>{index?"Voucher untuk teman":"Voucher untuk pengajak"}<select id={"campaign-voucher-"+index} name={key} autoComplete="off" required value={value.config[key]??""} onChange={event=>update({[key]:event.target.value})}><option value="">Pilih voucher akun</option>{data.templates.map(t=><option value={t.id} key={t.id}>{t.name} · {t.kind==="percent"?`${t.value}%`:t.kind==="fixed"?`Rp${Number(t.value).toLocaleString("id-ID")}`:`Hadiah · Rp${Number(t.value).toLocaleString("id-ID")}`} · berlaku s.d. {new Date(t.ends_at).toLocaleDateString("id-ID")}</option>)}</select><small>Hadiah diterbitkan sebagai voucher akun satu kali pakai.</small></label>)}
   </div>
   <h2 className={styles.sectionTitle}>Misi</h2><div className={styles.missions}>{value.config.missions.filter(m=>missionIds.includes(m.id)).map((m,index)=><section key={m.id} className={styles.mission}><strong>{index+1}. {m.id==="verified_email"?"Verifikasi email":m.id==="first_completed_order"?"Transaksi selesai pertama":"Ajak teman"}</strong><label className={styles.field} htmlFor={"mission-title-"+m.id}>Judul<AdminInput id={"mission-title-"+m.id} required maxLength={80} value={m.title} onChange={event=>changeMission(m.id,{title:event.target.value})}/></label><label className={styles.field} htmlFor={"mission-description-"+m.id}>Deskripsi<AdminTextarea id={"mission-description-"+m.id} maxLength={180} rows={2} value={m.description} onChange={event=>changeMission(m.id,{description:event.target.value})}/></label></section>)}</div>
   <div className={styles.actions}><button className="primary-button" type="submit" disabled={!draft||save.isPending}>{save.isPending?"Menyimpan…":"Simpan campaign"}</button><span>Progres misi dihitung dari status akun dan invoice.</span></div>
  </form>
  <section className={`commerce-panel ${styles.queuePanel}`}><div className={styles.queueHead}><div><h2>Referral yang perlu ditinjau</h2><p>Reward hanya diterbitkan setelah transaksi live selesai dan admin menyetujui.</p></div><span className={styles.queueCount}>{data.referrals.filter(row=>row.status==="qualified").length} menunggu</span></div>
   {data.referrals.filter(row=>row.status==="qualified").length===0?<p className={styles.empty}>Belum ada referral yang memenuhi syarat.</p>:<div className={styles.referrals}>{data.referrals.filter(row=>row.status==="qualified").map(row=><article key={row.id} className={styles.referral}><div><strong className={`${styles.referralStatus} ${styles["referral_"+row.status]}`}>{labels[row.status]}</strong><span>Pengajak: {row.referrer_user_id}</span><span>Teman: {row.referred_user_id}</span><small>Invoice: {row.qualifyingInvoice?.invoice_number??row.qualifying_invoice_id} · {row.qualifyingInvoice?.product_name??"Detail tidak tersedia"} · Rp{Number(row.qualifyingInvoice?.amount??0).toLocaleString("id-ID")}</small></div><div className={styles.actions}><button className="primary-button" type="button" disabled={review.isPending} onClick={()=>review.mutate({id:row.id,approve:true})}>Setujui & terbitkan voucher</button><button className="outline-button" type="button" disabled={review.isPending} onClick={()=>review.mutate({id:row.id,approve:false})}>Tolak</button></div></article>)}</div>}
  </section>
 </div>;
}
