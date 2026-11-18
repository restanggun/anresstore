"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { AdminInput, AdminTextarea } from "./form-controls";
import { AssistantChanges } from "./assistant-changes";
import { AssistantProposal, type AssistantProposalData } from "./assistant-proposal";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./assistant-workspace.module.css";

type VariantFields = {
  name: string;
  price: number;
  description: string;
  active: boolean;
};

type VariantContext = VariantFields & {
  product: string;
  provider_code: string;
  id: string;
  managed: boolean;
};

export function AssistantVariantPanel({
  variant, activePromoPrice, onClose, onApply, onAiApplied,
}: {
  variant: VariantContext;
  activePromoPrice?: number;
  onClose: () => void;
  onApply: (fields: VariantFields) => void;
  onAiApplied: (published: boolean) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(variant.price ? String(variant.price) : "");
  const [description, setDescription] = useState(variant.description);
  const [active, setActive] = useState(variant.active);
  const [prompt, setPrompt] = useState("");
  const connection = useQuery({
    queryKey: ["admin-assistant"],
    queryFn: ({ signal }) => adminRequest("assistant", "GET", undefined, signal) as Promise<{ configured: boolean; tools: string[] }>,
    enabled: variant.managed,
    retry: false,
  });
  const aiEnabled = variant.managed && connection.data?.configured && connection.data.tools.includes("catalog_edit");
  const aiDraft = useMutation({
    mutationFn: (text: string) => adminRequest("assistant/chat", "POST", {
      text, variantId: variant.id, agent: "Katalog & harga", skills: ["Edit produk"],
    }) as Promise<{ text: string; proposal?: AssistantProposalData }>,
  });
  const fields = { name: name.trim(), price: Number(price), description: description.trim(), active };
  const priceValid = Number.isSafeInteger(fields.price) && fields.price >= 1 && fields.price <= 100000000;
  const rows = [
    { label: "Nama varian", before: variant.name, after: fields.name },
    { label: "Harga jual", before: variant.price ? rupiah(variant.price) : "Belum diisi", after: priceValid ? rupiah(fields.price) : "Belum valid" },
    { label: "Deskripsi", before: variant.description, after: fields.description },
    { label: "Visibilitas", before: variant.active ? "Tampil di website" : "Disembunyikan", after: active ? "Tampil di website" : "Disembunyikan" },
  ].filter(row => row.before !== row.after);

  useEffect(() => {
    const panel = dialog.current;
    if (panel && !panel.open) panel.showModal();
  }, []);

  function close() {
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className={styles.drawer} aria-labelledby={titleId} onClose={onClose}>
      <header className={styles.panelHeader}>
        <span className={styles.icon}><Sparkles size={19} aria-hidden="true" /></span>
        <div><h2 id={titleId}>Bantu edit varian</h2><p>{aiEnabled ? "Asisten katalog" : "Pratinjau manual"}</p></div>
        <button type="button" autoFocus className="square-button" aria-label="Tutup Bantu edit" onClick={close}><X size={19} aria-hidden="true" /></button>
      </header>
      <form className={styles.drawerForm} onSubmit={event => {
        event.preventDefault();
        if (!fields.name || !priceValid || !rows.length) return;
        onApply(fields);
        close();
      }}>
        <div className={styles.drawerBody}>
          <div className={styles.variantContext}>
            <strong>{variant.name || "Varian baru"}</strong>
            <span>{[variant.product, variant.provider_code].filter(Boolean).join(" / ")}</span>
          </div>
          {aiEnabled ? <section className={styles.variantAi} aria-label="Siapkan draf dengan AI">
            <label>Perintah untuk varian ini<AdminTextarea aria-label="Perintah untuk varian ini" rows={2} maxLength={3000} value={prompt}
              onChange={event => setPrompt(event.target.value)} placeholder="Contoh: Ubah harga jual menjadi Rp27.000" /></label>
            <p className={styles.note}>Draf AI memakai varian yang tersimpan. Perubahan manual di editor perlu disimpan terpisah.</p>
            <button type="button" className="outline-button" disabled={!prompt.trim() || aiDraft.isPending} onClick={() => aiDraft.mutate(prompt.trim())}>
              <Sparkles size={15} aria-hidden="true" /> {aiDraft.isPending ? "Menyiapkan draf…" : "Minta draf AI"}
            </button>
            {aiDraft.data && <p className={styles.note} role="status">{aiDraft.data.text}</p>}
            {aiDraft.data?.proposal && <AssistantProposal key={aiDraft.data.proposal.id} proposal={aiDraft.data.proposal} onApplied={onAiApplied} />}
            {aiDraft.error && <p className={styles.chatError} role="alert">{aiDraft.error.message}</p>}
          </section> : <p className={styles.note}>Isi perubahan untuk meninjau dan memasukkannya ke editor varian.</p>}
          <label>Nama varian<AdminInput required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Harga jual (Rp)<AdminInput required type="number" min={1} max={100000000} step={1} value={price} onChange={event => setPrice(event.target.value)} /></label>
          <label>Deskripsi varian<AdminTextarea aria-label="Deskripsi varian" rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className={styles.checkbox}><AdminInput type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Tampilkan di website</label>
          {rows.length > 0 && <AssistantChanges rows={rows.map(row => ({
            ...row, before: row.before || "Kosong", after: row.after || "Kosong",
          }))} />}
          {activePromoPrice !== undefined && (
            <p className={styles.note}>Promo tersimpan sedang aktif dengan harga {rupiah(activePromoPrice)}. Cek jadwal promo di editor sebelum menyimpan.</p>
          )}
        </div>
        <footer className={styles.drawerFooter}>
          <button type="button" className="outline-button" onClick={close}>Batal</button>
          <button type="submit" className="primary-button" disabled={!rows.length || !fields.name || !priceValid}>
            Masukkan ke editor <ArrowRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </form>
    </dialog>
  );
}
