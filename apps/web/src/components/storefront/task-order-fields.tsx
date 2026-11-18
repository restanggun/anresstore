"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { money, type CatalogItem } from "@/lib/catalog";
import Link from "./domain-link";

type Pricing = NonNullable<CatalogItem["taskPricing"]>;
export const taskUnitNames: Record<Exclude<Pricing["unit"], "custom">, string> = {
  page: "lembar", slide: "slide", minute: "menit", item: "item",
};

export function TaskOrderFields({ item, quantity, days, revisions, brief, reference, quote, quoteError, signedIn, sessionLoading, onQuantity, onDays, onRevisions, onBrief, onReference, onCheckout }: {
  item: CatalogItem;
  quantity: number; days: number; revisions: number; brief: string; reference: string;
  quote: number | null; quoteError: string; signedIn: boolean; sessionLoading: boolean;
  onQuantity: (value: number) => void; onDays: (value: number) => void; onRevisions: (value: number) => void;
  onBrief: (value: string) => void; onReference: (value: string) => void; onCheckout: () => void;
}) {
  const titleId = useId();
  const briefId = useId();
  const referenceId = useId();
  const attempt = useRef<{id: string; subject: string; body: string} | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const pricing = item.taskPricing;
  const custom = pricing?.unit === "custom";
  const unit = pricing?.unit && pricing.unit !== "custom" ? taskUnitNames[pricing.unit] : "lembar";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || sent) return;
    setError("");
    if (brief.trim().length < 10) {
      setError("Brief minimal 10 karakter setelah spasi di awal dan akhir dihapus.");
      event.currentTarget.querySelector("textarea")?.focus();
      return;
    }
    if (!custom) {
      if (quote === null) { setError("Tunggu harga muncul, atau periksa kembali jumlah dan tenggat."); return; }
      onCheckout();
      return;
    }
    if (!signedIn) return;
    const subject = ("Penawaran Joki: " + item.displayName).slice(0, 160);
    const body = [
      "Layanan: " + item.product + " / " + item.displayName,
      "Tenggat: " + days + " hari",
      "Brief: " + brief.trim(),
      reference.trim() ? "Bahan: " + reference.trim() : "",
    ].filter(Boolean).join("\n\n");
    if (body.length > 3000) { setError("Ringkas brief dan tautan bahan agar permintaan muat."); return; }
    const previous = attempt.current;
    const request = previous?.body === body && previous.subject === subject ? previous : {id:crypto.randomUUID(),subject,body};
    attempt.current = request;
    submitting.current = true;
    setBusy(true);
    try {
      const { supportCall } = await import("./support-ticket-panel");
      await supportCall("", "POST", request);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan belum dapat dikirim. Coba lagi.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (sent) return <div className="catalog-manual-note" role="status">
    <p>Brief terkirim ke tim Anres. Lihat balasan dan penawaran di tiket CS.</p>
    <Link href="/bantuan#support-inbox" className="shop-text-button">Buka tiket CS</Link>
  </div>;

  return <form className="task-order-options" aria-labelledby={titleId} onSubmit={event => void submit(event)}>
    <h3 id={titleId}>{custom ? "Minta penawaran" : "Rincian pengerjaan"}</h3>
    {item.description && <p>{item.description}</p>}
    <p className="field-note">Jangan sertakan kata sandi atau kode OTP di brief.</p>
    {custom && <p>Admin akan meninjau brief dan membalas lewat tiket CS sebelum kamu membayar.</p>}
    <fieldset className="task-scope-fields" disabled={busy}>
      <legend className="sr-only">Ruang lingkup pengerjaan</legend>
      <label htmlFor={briefId}>Brief pekerjaan
        <textarea id={briefId} name="brief" required minLength={10} maxLength={custom ? 2000 : 3000} rows={4}
          value={brief} onChange={event=>{onBrief(event.target.value);setError("");}}
          placeholder="Jelaskan hasil yang kamu inginkan dan ketentuan khusus."/>
      </label>
      <label htmlFor={referenceId}>Tautan bahan (opsional)
        <Input id={referenceId} name="reference" type="url" pattern="https://.+" maxLength={500} value={reference}
          onChange={event=>onReference(event.target.value)} placeholder="https://..."/>
      </label>
      <div className="task-order-grid">
        {!custom && <label>Jumlah {unit}<Input name="quantity" required type="number" inputMode="numeric" min={1} max={pricing?.maxUnits ?? 500}
          value={quantity || ""} onChange={event=>onQuantity(Number(event.target.value))}/></label>}
        <label>Tenggat (hari)<Input name="deadline_days" required type="number" inputMode="numeric" min={1} max={90}
          value={days || ""} onChange={event=>onDays(Number(event.target.value))}/></label>
        {!custom && (pricing?.maxRevisions ?? 20) > 0 && <label>Revisi tambahan<Input name="revisions" required type="number" inputMode="numeric" min={0}
          max={pricing?.maxRevisions ?? 20} value={revisions} onChange={event=>onRevisions(Number(event.target.value))}/></label>}
      </div>
    </fieldset>
    {quoteError && !custom && <p role="alert">{quoteError}</p>}
    {error && <p role="alert">{error}</p>}
    {!custom && quote !== null && <p role="status"><strong>Harga pekerjaan: {money(quote)}</strong></p>}
    {custom && !signedIn
      ? sessionLoading ? <p role="status">Memeriksa sesi...</p> : <Button asChild className="order-primary"><Link href="/login">Masuk untuk minta penawaran<ArrowRight size={17}/></Link></Button>
      : <Button className="order-primary" type="submit" disabled={busy}>{busy ? "Mengirim..." : custom ? "Kirim brief ke CS" : "Lanjut ke checkout"}<ArrowRight size={17}/></Button>}
  </form>;
}
