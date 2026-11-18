"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminInput } from "./form-controls";
import { CustomSelect } from "./custom-select";
import { adminRequest, rupiah } from "./workspace-api";

const units = { page: "lembar", slide: "slide", minute: "menit", item: "item", custom: "proyek custom" } as const;
type Unit = keyof typeof units;
type Rule = {
  pricing_unit: Unit; base_fee: number | null; price_per_page: number; price_per_revision: number;
  rush_fee_per_day: number; standard_days: number; max_pages: number; max_revisions: number;
};
type NumberField = Exclude<keyof Rule, "pricing_unit" | "base_fee">;
const initial: Rule = {
  pricing_unit:"page", base_fee:null, price_per_page:0, price_per_revision:0, rush_fee_per_day:0,
  standard_days:7, max_pages:100, max_revisions:0,
};

export function TaskPricingEditor({productId,basePrice,canWrite}: {productId:string;basePrice:number;canWrite:boolean}) {
  const query = useQuery({queryKey:["task-pricing",productId],queryFn:()=>adminRequest("task-pricing/"+productId) as Promise<{rule:Rule|null}>});
  const [draft,setDraft] = useState<Rule>(initial);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const unit = units[draft.pricing_unit];
  const custom = draft.pricing_unit === "custom";

  useEffect(() => {
    if (!query.data) return;
    const rule = query.data.rule;
    setDraft(rule ? {
      pricing_unit: rule.pricing_unit ?? "page",
      base_fee: rule.base_fee ?? null,
      price_per_page: rule.price_per_page,
      price_per_revision: rule.price_per_revision,
      rush_fee_per_day: rule.rush_fee_per_day,
      standard_days: rule.standard_days,
      max_pages: rule.max_pages,
      max_revisions: rule.max_revisions,
    } : initial);
  }, [query.data]);

  const fields: [NumberField,string,number,number][] = [
    ["price_per_page","Tarif per "+unit+" (Rp)",0,1000000],
    ["max_pages","Batas jumlah "+unit,1,500],
    ["standard_days","Tenggat standar (hari)",1,90],
    ["rush_fee_per_day","Biaya percepatan per hari (Rp)",0,1000000],
    ["price_per_revision","Harga per revisi tambahan (Rp)",0,1000000],
    ["max_revisions","Batas revisi tambahan",0,20],
  ];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canWrite) return;
    setBusy(true); setMessage(""); setError("");
    try {
      await adminRequest("task-pricing/"+productId,"POST",draft);
      await query.refetch();
      setMessage("Aturan tarif disimpan.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tarif belum dapat disimpan.");
    } finally { setBusy(false); }
  }

  return <section className="variant-promotion">
    <h3>Tarif Joki Tugas</h3>
    {query.isPending ? <p role="status">Memuat tarif...</p> : query.error ? <p role="alert">{query.error.message}</p> :
      <form className="variant-form" onSubmit={event=>void save(event)}>
        <fieldset disabled={busy || !canWrite}>
          <legend>Model harga</legend>
          <label>Dasar perhitungan
            <CustomSelect aria-label="Dasar perhitungan" value={draft.pricing_unit} onChange={event=>setDraft({...draft,pricing_unit:event.target.value as Unit})}>
              <option value="page">Per lembar</option>
              <option value="slide">Per slide</option>
              <option value="minute">Per menit</option>
              <option value="item">Per item</option>
              <option value="custom">Penawaran custom lewat CS</option>
            </CustomSelect>
          </label>
          <p className="field-note">{custom
            ? "Pelanggan mengirim brief ke Tiket CS. Varian ini tidak memiliki harga checkout otomatis."
            : "Total dihitung dari harga dasar " + rupiah(draft.base_fee ?? basePrice) + ", tarif per " + unit + ", revisi, dan biaya percepatan jika berlaku."}</p>
          {!custom && <div className="form-two-columns">
            <label>Biaya dasar pengerjaan (Rp)
              <AdminInput name="base_fee" type="number" min={0} max={100000000} step={1}
                value={draft.base_fee ?? ""} placeholder={String(basePrice)}
                onChange={event=>setDraft({...draft,base_fee:event.target.value==="" ? null : Number(event.target.value)})}/>
              <small>Isi 0 untuk tarif murni per {unit}. Kosong memakai harga dasar varian.</small>
            </label>
            {fields.map(([key,label,min,max])=>
            <label key={key}>{label}<AdminInput name={key} required type="number" min={min} max={max} step={1}
              value={draft[key]} onChange={event=>setDraft({...draft,[key]:Number(event.target.value)})}/></label>)}</div>}
          {canWrite && <button className="outline-button" type="submit" disabled={busy}>{busy?"Menyimpan...":"Simpan tarif joki"}</button>}
        </fieldset>
      </form>}
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {message && <p role="status" className="workspace-feedback">{message}</p>}
  </section>;
}
