"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Bot, Paperclip, Plus, Send, Sparkles, X } from "lucide-react";
import { AdminTextarea } from "./form-controls";
import styles from "./assistant-workspace.module.css";

const skills = [
  { label: "Cari produk", tool: "catalog_search" }, { label: "Edit harga", tool: "catalog_edit" },
  { label: "Edit produk", tool: "catalog_edit" }, { label: "Cek promo", tool: "promotions" },
  { label: "Ringkas transaksi", tool: "analytics" }, { label: "Draf balasan CS", tool: "support_draft" },
  { label: "Pantau joki tugas", tool: "task_orders" }, { label: "Pantau pesanan premium", tool: "premium_orders" },
  { label: "Analisis lampiran", tool: "file_review" },
];
const agents = [
  { label: "Katalog & harga", tool: "catalog_search" }, { label: "Operasional pesanan", tool: "transactions" },
  { label: "Analisis transaksi", tool: "analytics" }, { label: "Bantuan pelanggan", tool: "support" },
];

export type ComposerContext = { skills: string[]; agent: string; files: File[] };
export type AssistantOption = { id: string; label: string };
type AssistantAgentOption = AssistantOption & { tools?: string[] };
export type AssistantOptions = { skills: AssistantOption[]; agents: AssistantAgentOption[] };
const emptyContext: ComposerContext = { skills: [], agent: "", files: [] };

export function AssistantComposer({
  text, onTextChange, onSend, responding, messageInput, attachments, demo, tools, disabled, options,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onSend: (context: ComposerContext) => void;
  responding: boolean;
  attachments: boolean;
  demo: boolean;
  disabled: boolean;
  tools: string[];
  options?: AssistantOptions;
  messageInput: RefObject<HTMLTextAreaElement | null>;
}) {
  const menuId = useId();
  const [context, setContext] = useState(emptyContext);
  const [view, setView] = useState<"actions" | "skills" | "agents">("actions");
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const knownSkills = !demo && options ? options.skills : skills.filter(item => demo || tools.includes(item.tool)).map(item => ({ id: item.label, label: item.label }));
  const availableAgents: AssistantAgentOption[] = !demo && options ? options.agents : agents.filter(item => demo || tools.includes(item.tool)).map(item => ({ id: item.label, label: item.label }));
  const agentAllows = (agentId: string, skillId: string) => {
    const scope = availableAgents.find(item => item.id === agentId)?.tools;
    return !scope || skillId === "file_review" || scope.includes(skillId === "Edit harga" ? "catalog_edit" : skillId);
  };
  const availableSkills = knownSkills.filter(item => agentAllows(context.agent, item.id));
  const optionLabel = (items: AssistantOption[], id: string) => items.find(item => item.id === id)?.label ?? id;

  useEffect(() => {
    const panel = menu.current;
    if (panel && (fallbackOpen || (typeof panel.showPopover === "function" && panel.matches(":popover-open")))) {
      panel.querySelector("button")?.focus();
    }
  }, [view, fallbackOpen]);

  function closeMenu() {
    menu.current?.hidePopover?.();
    setFallbackOpen(false);
    trigger.current?.focus();
  }

  const chips = [
    ...context.skills.map(id => ({
      label: optionLabel(availableSkills, id), icon: Sparkles, key: `skill-${id}`,
      remove: () => setContext(current => ({ ...current, skills: current.skills.filter(skill => skill !== id) })),
    })),
    ...(context.agent ? [{
      label: optionLabel(availableAgents, context.agent), icon: Bot, key: "agent",
      remove: () => setContext(current => ({ ...current, agent: "" })),
    }] : []),
    ...context.files.map((file, index) => ({
      label: file.name, icon: Paperclip, key: `file-${index}-${file.name}`,
      remove: () => setContext(current => ({ ...current, files: current.files.filter((_, i) => i !== index) })),
    })),
  ];

  return (
    <form className={styles.composer} onSubmit={event => {
      event.preventDefault();
      if (!text.trim() || responding || disabled) return;
      onSend(context);
      setContext(emptyContext);
      messageInput.current?.focus();
    }}>
      <div className={styles.composerSurface}>
        {!!chips.length && (
          <ul className={styles.chips} aria-label="Konteks pesan">
            {chips.map(({ label, icon: Icon, key, remove }) => (
              <li key={key}><Icon size={14} aria-hidden="true" /><span>{label}</span>
                <button type="button" aria-label={`Lepas ${label}`} onClick={() => { remove(); messageInput.current?.focus(); }}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AdminTextarea
          ref={messageInput} rows={2} aria-label="Pesan untuk Asisten Anres" value={text}
          maxLength={3000} disabled={disabled}
          placeholder="Tulis pesan untuk Asisten Anres…" onChange={event => onTextChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <div className={styles.composerRow}>
          <div className={styles.actionAnchor}>
            <button
              ref={trigger} type="button" className={styles.addButton} popoverTarget={menuId}
              aria-label="Tambah skill, agent, atau file" aria-controls={menuId}
              disabled={disabled || (!attachments && !availableSkills.length && !availableAgents.length)}
              onClick={event => {
                setView("actions");
                if (typeof menu.current?.showPopover !== "function") {
                  event.preventDefault();
                  setFallbackOpen(open => !open);
                }
              }}
            ><Plus size={19} aria-hidden="true" /></button>
            <div
              ref={menu} id={menuId} popover="auto" className={styles.actionPanel}
              data-fallback-open={fallbackOpen || undefined} role="group" aria-label="Tambahkan ke pesan"
              onKeyDown={event => {
                if (fallbackOpen && event.key === "Escape") { event.preventDefault(); closeMenu(); }
              }}
              onBlur={event => {
                if (fallbackOpen && event.relatedTarget !== trigger.current && !event.currentTarget.contains(event.relatedTarget)) setFallbackOpen(false);
              }}
            >
              {view === "actions" ? <>
                {!!availableSkills.length && <button type="button" onClick={() => setView("skills")}><Sparkles size={16} aria-hidden="true" /> Tambah skill</button>}
                {!!availableAgents.length && <button type="button" onClick={() => setView("agents")}><Bot size={16} aria-hidden="true" /> Pilih agent</button>}
                {attachments && <button type="button" onClick={() => { closeMenu(); fileInput.current?.click(); }}><Paperclip size={16} aria-hidden="true" /> Lampirkan file</button>}
              </> : <>
                <button type="button" onClick={() => setView("actions")}><ArrowLeft size={16} aria-hidden="true" /> {view === "skills" ? "Pilih skill" : "Pilih agent"}</button>
                {(view === "skills" ? availableSkills : availableAgents).map(({ id, label }) => (
                  <button type="button" key={id} onClick={() => {
                    setContext(current => view === "skills" ? { ...current, skills: [...current.skills, id] }
                      : { ...current, agent: id, skills: current.skills.filter(skill => agentAllows(id, skill)) });
                    closeMenu();
                  }} disabled={view === "skills" ? context.skills.includes(id) || context.skills.length >= 16 : context.agent === id}>{label}</button>
                ))}
              </>}
            </div>
            <input ref={fileInput} type="file" hidden multiple accept={demo ? undefined : ".txt,.md,.csv,.json"} onChange={event => {
              const selected = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              const files = [...context.files, ...selected];
              if (!demo && (files.length > 3 || files.some(file => !/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 32000))) {
                setFileError("Pilih maksimal tiga file teks TXT, MD, CSV, atau JSON.");
                return;
              }
              setFileError("");
              setContext(current => ({ ...current, files }));
            }} />
          </div>
          <button className={`primary-button ${styles.sendButton}`} type="submit" disabled={!text.trim() || responding || disabled}>
            <Send size={16} aria-hidden="true" /> Kirim
          </button>
        </div>
      </div>
      {fileError && <p className={styles.chatError} role="alert">{fileError}</p>}
      <p className={styles.composerNote}>{demo ? "Pratinjau lokal. File dan pesan tidak diunggah."
        : attachments ? "Lampiran teks dikirim ke provider AI saat kamu menekan Kirim. Hindari rahasia dan data pribadi."
        : "Hindari mengirim kata sandi, OTP, atau data pribadi."}</p>
    </form>
  );
}
