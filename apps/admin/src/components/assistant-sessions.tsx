"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Plus, Trash2, X } from "lucide-react";
import { adminRequest } from "./workspace-api";
import styles from "./assistant-workspace.module.css";

type SessionSummary = { id: string; title: string; touched_at: string };
export type SavedSession = SessionSummary & {
  turns: { id: string; user: { text: string; sentAt: string }; reply: {
    text: string; sentAt: string; section?: string; model?: string; sources?: { title: string; url: string; checkedAt: string }[];
  } }[];
};

export const assistantSessionsKey = ["admin-assistant-sessions"];
const formatDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function AssistantSessions({ currentId, disabled, onNew, onOpen, onDelete }: {
  currentId: string | null;
  disabled: boolean;
  onNew: () => void;
  onOpen: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"history" | "memory">("history");
  const [offset, setOffset] = useState(0);
  const [renaming, setRenaming] = useState<SessionSummary>();
  const [removing, setRemoving] = useState<SessionSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const history = useQuery({
    queryKey: [...assistantSessionsKey, offset],
    queryFn: ({ signal }) => adminRequest(`assistant/sessions?offset=${offset}`, "GET", undefined, signal) as Promise<{ sessions: SessionSummary[]; more: boolean }>,
    enabled: open && view === "history", retry: false,
  });
  const memory = useQuery({
    queryKey: ["admin-assistant-memory"],
    queryFn: ({ signal }) => adminRequest("assistant/memory", "GET", undefined, signal) as Promise<{ note: string }>,
    enabled: open && view === "memory", retry: false,
  });

  function show(next: typeof view) {
    setView(next);
    setError("");
    setRenaming(undefined);
    setRemoving(undefined);
  }

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Permintaan gagal. Coba lagi."); }
    finally { setBusy(false); }
  }

  return <>
    <div className={styles.sessionActions}>
      <button type="button" className={styles.historyButton} disabled={disabled} onClick={() => {
        show("history");
        setOffset(0);
        setOpen(true);
        dialog.current?.showModal();
      }}><History size={17} aria-hidden="true" /> Riwayat</button>
      <button type="button" className={styles.newSessionButton} disabled={disabled} onClick={onNew}>
        <Plus size={17} aria-hidden="true" /> Chat baru
      </button>
    </div>
    <dialog ref={dialog} className={styles.sessionDialog} aria-labelledby="assistant-session-heading"
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClose={() => setOpen(false)}>
      <header className={styles.sessionDialogHeader}>
        <h2 id="assistant-session-heading">{removing ? "Hapus sesi?" : renaming ? "Ubah judul" : view === "memory" ? "Memori antar sesi" : "Riwayat chat"}</h2>
        <button type="button" className={styles.sessionIconButton} aria-label="Tutup" disabled={busy} onClick={() => dialog.current?.close()}><X size={19} aria-hidden="true" /></button>
      </header>
      {open && <>
        {error && <p className={styles.chatError} role="alert">{error}</p>}
        {removing ? <>
          <p>Pesan di sesi “{removing.title}” akan dihapus.</p>
          <div className={styles.dialogActions}>
            <button type="button" className="outline-button" disabled={busy} autoFocus onClick={() => setRemoving(undefined)}>Batal</button>
            <button type="button" className={styles.destructiveButton} disabled={busy} onClick={() => void perform(async () => {
              await adminRequest(`assistant/sessions/${removing.id}`, "DELETE");
              onDelete(removing.id);
              setRemoving(undefined);
              setOffset(0);
              await queryClient.invalidateQueries({ queryKey: assistantSessionsKey });
            })}>Hapus sesi</button>
          </div>
        </> : renaming ? <form className={styles.sessionForm} onSubmit={event => {
          event.preventDefault();
          const title = new FormData(event.currentTarget).get("title");
          void perform(async () => {
            await adminRequest(`assistant/sessions/${renaming.id}`, "PATCH", { title });
            setRenaming(undefined);
            await queryClient.invalidateQueries({ queryKey: assistantSessionsKey });
          });
        }}>
          <label htmlFor="assistant-session-title">Judul sesi</label>
          <input id="assistant-session-title" name="title" defaultValue={renaming.title} maxLength={80} required autoFocus />
          <div className={styles.dialogActions}>
            <button type="button" className="outline-button" disabled={busy} onClick={() => setRenaming(undefined)}>Batal</button>
            <button type="submit" className="primary-button" disabled={busy}>Simpan</button>
          </div>
        </form> : <>
          <nav className={styles.sessionTabs} aria-label="Pengaturan percakapan">
            <button type="button" className={styles.historyButton} aria-pressed={view === "history"} onClick={() => show("history")} disabled={busy}>Sesi chat</button>
            <button type="button" className={styles.historyButton} aria-pressed={view === "memory"} onClick={() => show("memory")} disabled={busy}>Memori</button>
          </nav>
          {view === "history" ? <>
            {history.isPending && <p role="status">Memuat riwayat…</p>}
            {history.isError && <p className={styles.chatError} role="alert">{history.error.message}</p>}
            {history.data?.sessions.length === 0 && <p>Belum ada sesi di halaman ini.</p>}
            <ul className={styles.sessionList}>
              {history.data?.sessions.map(session => <li key={session.id}>
                <button type="button" className={styles.sessionSelect} aria-current={session.id === currentId ? "true" : undefined}
                  disabled={busy} onClick={() => void perform(async () => {
                    const saved: SavedSession = await adminRequest(`assistant/sessions/${session.id}`);
                    dialog.current?.close();
                    onOpen(saved);
                  })}>
                  <strong>{session.title}</strong>
                  <time dateTime={session.touched_at}>{formatDate.format(new Date(session.touched_at))}</time>
                </button>
                <button type="button" className={styles.sessionIconButton} disabled={busy} aria-label={`Ubah judul ${session.title}`} onClick={() => { setError(""); setRenaming(session); }}><Pencil size={16} aria-hidden="true" /></button>
                <button type="button" className={styles.sessionIconButton} disabled={busy} aria-label={`Hapus ${session.title}`} onClick={() => { setError(""); setRemoving(session); }}><Trash2 size={16} aria-hidden="true" /></button>
              </li>)}
            </ul>
            {(offset > 0 || history.data?.more) && <div className={styles.dialogActions}>
              <button type="button" className="outline-button" disabled={offset === 0 || busy} onClick={() => setOffset(offset - 30)}>Sebelumnya</button>
              <button type="button" className="outline-button" disabled={!history.data?.more || busy} onClick={() => setOffset(offset + 30)}>Berikutnya</button>
            </div>}
          </> : <>
            {memory.isPending && <p role="status">Memuat memori…</p>}
            {memory.isError && <p className={styles.chatError} role="alert">{memory.error.message}</p>}
            {memory.data && <form className={styles.sessionForm} onSubmit={event => {
              event.preventDefault();
              const note = new FormData(event.currentTarget).get("note");
              void perform(async () => {
                const saved: { note: string } = await adminRequest("assistant/memory", "PATCH", { note });
                queryClient.setQueryData(["admin-assistant-memory"], saved);
                dialog.current?.close();
              });
            }}>
              <label htmlFor="assistant-memory-note">Preferensi yang dipakai di semua sesi</label>
              <p id="assistant-memory-hint">Simpan istilah atau gaya balasan. Kosongkan untuk menghapus. Hindari kredensial dan data pelanggan.</p>
              <textarea id="assistant-memory-note" name="note" aria-describedby="assistant-memory-hint" rows={4} maxLength={1000} defaultValue={memory.data.note} />
              <div className={styles.dialogActions}><button type="submit" className="primary-button" disabled={busy}>Simpan memori</button></div>
            </form>}
          </>}
        </>}
      </>}
    </dialog>
  </>;
}
