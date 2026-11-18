"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminInput, AdminTextarea } from "./form-controls";
import { adminRequest } from "./workspace-api";
import styles from "./landing-workspace.module.css";

type Config = {
  announcementEnabled:boolean; announcementText:string; announcementHref:string; announcementLabel:string;
  announcementMoving:boolean; startsAt:string|null; endsAt:string|null;
  closingTitle:string; closingBody:string; showAuthCta:boolean;
};
type Data = { revision:number; config:Config };
const dateInput = (value:string|null) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Jakarta", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value));
  const part = (type:Intl.DateTimeFormatPartTypes) => parts.find(item=>item.type===type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const isoDate = (value:string) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const year=Number(match[1]), month=Number(match[2]), day=Number(match[3]), hour=Number(match[4]), minute=Number(match[5]);
  if (![year,month,day,hour,minute].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year,month-1,day,hour-7,minute)).toISOString();
};

export function LandingWorkspace() {
  const query = useQuery({ queryKey:["storefront-landing-settings"], queryFn:({signal})=>adminRequest("storefront/landing","GET",undefined,signal) as Promise<Data>, retry:false });
  return <section>
    <div className="workspace-heading"><div><h1>Landing & grand opening</h1><p>Atur pengumuman di atas navbar dan ajakan di halaman utama. Angka transaksi serta rating selalu mengikuti data aktual.</p></div></div>
    {query.data ? <LandingEditor key={query.data.revision} data={query.data}/> : query.error ? <p className="workspace-error" role="alert">{query.error.message}</p> : <p role="status">Memuat pengaturan landing page…</p>}
  </section>;
}

function LandingEditor({data}:{data:Data}) {
  const [revision,setRevision]=useState(data.revision);
  const [form,setForm]=useState({...data.config});
  const save=useMutation({mutationFn:()=>adminRequest("storefront/landing","POST",{revision,...form}),onSuccess:result=>setRevision(result.revision)});
  const set=(patch:Partial<Config>)=>setForm(current=>({...current,...patch}));
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();save.mutate();};
  return <div className={styles.workspace}>
    {save.isSuccess&&<p className={styles.success} role="status">Pengaturan tersimpan. Versi {revision} sudah aktif.</p>}
    {save.error&&<p className={styles.error} role="alert">{save.error.message}</p>}
    <form className={styles.form} onSubmit={submit} aria-labelledby="landing-form-title">
      <h2 id="landing-form-title" className="sr-only">Pengaturan konten landing page Anres</h2>
      <section className={styles.panel} aria-labelledby="announcement-heading">
        <div className={styles.panelHeading}><div><h2 id="announcement-heading">Pengumuman di atas navbar</h2><p>Contoh: Grand opening, promo pembukaan, atau informasi layanan.</p></div></div>
        <div className={styles.switch}><AdminInput id="landing-announcement-enabled" name="announcementEnabled" type="checkbox" checked={form.announcementEnabled} onChange={event=>set({announcementEnabled:event.target.checked})}/><label htmlFor="landing-announcement-enabled">Aktifkan pengumuman</label></div>
        <div className={styles.field}><label className={styles.fieldTitle} htmlFor="landing-announcement-text">Pesan banner{form.announcementEnabled&&<b aria-hidden="true"> *</b>}</label><span className={styles.counter}>{form.announcementText.length}/220</span><AdminTextarea id="landing-announcement-text" name="announcementText" required={form.announcementEnabled} minLength={form.announcementEnabled?3:0} maxLength={220} rows={3} value={form.announcementText} onChange={event=>set({announcementText:event.target.value})} placeholder="Selamat datang di grand opening Anres Store"/></div>
        <div className={styles.grid}>
          <div className={styles.field}><label htmlFor="landing-announcement-href">Tautan internal (opsional)</label><AdminInput id="landing-announcement-href" name="announcementHref" value={form.announcementHref} onChange={event=>set({announcementHref:event.target.value})} placeholder="/katalog" maxLength={200}/><small>Gunakan path website Anres yang diawali /.</small></div>
          <div className={styles.field}><label htmlFor="landing-announcement-label">Label tautan</label><AdminInput id="landing-announcement-label" name="announcementLabel" value={form.announcementLabel} onChange={event=>set({announcementLabel:event.target.value})} placeholder="Lihat katalog" maxLength={50}/></div>
        </div>
        <div className={styles.grid}>
          <div className={styles.field}><label htmlFor="landing-announcement-start">Mulai tampil (opsional)</label><AdminInput id="landing-announcement-start" name="startsAt" type="datetime-local" value={dateInput(form.startsAt)} onChange={event=>set({startsAt:isoDate(event.target.value)})}/><small>Waktu Indonesia Barat (WIB).</small></div>
          <div className={styles.field}><label htmlFor="landing-announcement-end">Selesai tampil (opsional)</label><AdminInput id="landing-announcement-end" name="endsAt" type="datetime-local" value={dateInput(form.endsAt)} onChange={event=>set({endsAt:isoDate(event.target.value)})}/><small>Banner otomatis disembunyikan setelah waktu ini.</small></div>
        </div>
        <div className={styles.switch}><AdminInput id="landing-announcement-moving" name="announcementMoving" type="checkbox" checked={form.announcementMoving} onChange={event=>set({announcementMoving:event.target.checked})}/><label htmlFor="landing-announcement-moving">Jalankan banner berjalan</label><span>Pengunjung tetap bisa menjedanya.</span></div>
      </section>
      <section className={styles.panel} aria-labelledby="cta-heading">
        <div className={styles.panelHeading}><div><h2 id="cta-heading">Ajakan landing page</h2><p>CTA daftar dan login tampil di hero untuk pengunjung yang belum masuk.</p></div></div>
        <div className={styles.switch}><AdminInput id="landing-show-auth-cta" name="showAuthCta" type="checkbox" checked={form.showAuthCta} onChange={event=>set({showAuthCta:event.target.checked})}/><label htmlFor="landing-show-auth-cta">Tampilkan CTA daftar dan login</label></div>
        <div className={styles.grid}>
          <div className={styles.field}><label className={styles.fieldTitle} htmlFor="landing-closing-title">Judul CTA penutup <b aria-hidden="true">*</b></label><AdminInput id="landing-closing-title" name="closingTitle" required minLength={3} maxLength={90} value={form.closingTitle} onChange={event=>set({closingTitle:event.target.value})}/></div>
          <div className={styles.field}><label className={styles.fieldTitle} htmlFor="landing-closing-body">Deskripsi CTA penutup <b aria-hidden="true">*</b></label><AdminTextarea id="landing-closing-body" name="closingBody" required minLength={3} maxLength={220} rows={2} value={form.closingBody} onChange={event=>set({closingBody:event.target.value})}/></div>
        </div>
      </section>
      <div className={styles.actions}><span>Transaksi dan rating tidak bisa diubah dari sini; keduanya dihitung otomatis.</span><button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending?"Menyimpan…":"Simpan pengaturan"}</button></div>
    </form>
  </div>;
}
