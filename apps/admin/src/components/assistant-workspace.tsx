"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Box, MessageSquare, ShoppingBag, Sparkles } from "lucide-react";
import { AssistantChanges } from "./assistant-changes";
import { AssistantComposer, type AssistantOptions, type ComposerContext } from "./assistant-composer";
import { AssistantSessions, assistantSessionsKey, type SavedSession } from "./assistant-sessions";
import { AssistantBatch, AssistantProposal, type AssistantBatchData, type AssistantProposalData, type AssistantVariant } from "./assistant-proposal";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./assistant-workspace.module.css";

const examples = [
  {
    title: "Edit harga", icon: Box, section: "catalog" as const,
    prompt: "Naikkan harga 86 Diamonds Mobile Legends jadi Rp27.000.",
    answer: "Varian 86 Diamonds ditemukan. Tinjau perubahan harga dasar dan harga yang dilihat pelanggan selama promo aktif.",
    changes: [
      { label: "Harga dasar", before: "Rp25.000", after: "Rp27.000" },
      { label: "Harga selama promo", before: "Rp23.000", after: "Rp23.000" },
    ],
  },
  {
    title: "Cek pesanan", icon: ShoppingBag, section: "fulfillment" as const,
    prompt: "Pesanan mana yang sudah lunas tapi belum dikirim?",
    answer: "Ada 3 pesanan lunas dalam contoh antrean ini. Dua siap dikirim dan satu masih menunggu tinjauan manual.",
  },
  {
    title: "Ringkas transaksi", icon: BarChart3, section: "reports" as const,
    prompt: "Ringkas transaksi tujuh hari terakhir.",
    answer: "Dalam contoh periode ini, 24 pembayaran terverifikasi dengan total Rp1.250.000. Buka laporan untuk melihat data toko.",
  },
  {
    title: "Draf balasan CS", icon: MessageSquare, section: "conversations" as const,
    prompt: "Buat draf balasan untuk pelanggan yang tanya kapan pesanannya dikirim.",
    answer: "Halo, terima kasih sudah menghubungi Anres Store. Tim kami akan mengecek status pesananmu. Kamu juga bisa melihat status terbaru di halaman Invoice.",
  },
];

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sentAt: Date;
  changes?: (typeof examples)[number]["changes"];
  context?: string[];
  demo?: boolean;
  section?: keyof typeof destinations;
  choices?: AssistantVariant[];
  proposal?: AssistantProposalData;
  batch?: AssistantBatchData;
  sources?: { title: string; url: string; checkedAt: string }[];
  trace?: { tool: string; label: string; status: string }[];
};

const sentTime = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const destinations = {
  catalog: "Buka katalog", fulfillment: "Buka antrean", orders: "Buka pesanan", payments: "Buka pembayaran",
  reports: "Buka laporan", system: "Buka status sistem", conversations: "Buka room chat CS",
  vouchers: "Buka voucher", overview: "Buka ringkasan", tasks: "Buka joki tugas", apps: "Buka aplikasi premium",
};
export type AssistantStatus = { configured: boolean; attachments: boolean; tools: string[]; canManage?: boolean; canManageLanding?: boolean; skills?: AssistantOptions["skills"]; agents?: AssistantOptions["agents"] };
type AssistantReply = Pick<Message, "text" | "section" | "choices" | "proposal" | "batch" | "sources" | "trace"> & { sentAt?: string };

export function AssistantWorkspace({ onNavigate }: { onNavigate: (section: string) => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const retry = useRef<{ sessionId: string; text: string; turnId: string } | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const connection = useQuery({
    queryKey: ["admin-assistant"],
    queryFn: ({ signal }) => adminRequest("assistant", "GET", undefined, signal) as Promise<AssistantStatus>,
    retry: false,
  });
  const demo = process.env.NODE_ENV !== "production" && connection.data?.configured === false;
  const canChat = demo || connection.data?.configured === true;

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    request.current?.abort();
  }, []);
  useEffect(() => {
    const log = conversation.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, responding]);

  function appendReply(result: AssistantReply & Pick<Message, "demo" | "changes">) {
    const reply: Message = { ...result, id: crypto.randomUUID(), role: "assistant", sentAt: result.sentAt ? new Date(result.sentAt) : new Date() };
    setMessages(current => [...current, reply]);
  }

  function switchSession(session?: SavedSession) {
    retry.current = null;
    setSessionId(session?.id ?? null);
    setText("");
    setError("");
    setDraftKey(key => key + 1);
    setMessages(session?.turns.flatMap(turn => [
      { id: turn.id, role: "user" as const, text: turn.user.text, sentAt: new Date(turn.user.sentAt) },
      {
        id: `${turn.id}-reply`, role: "assistant" as const, text: turn.reply.text, sentAt: new Date(turn.reply.sentAt),
        sources: turn.reply.sources,
        section: turn.reply.section && Object.hasOwn(destinations, turn.reply.section) ? turn.reply.section as keyof typeof destinations : undefined,
      },
    ]) ?? []);
  }

  function send(context: ComposerContext) {
    const prompt = text.trim();
    if (!prompt || timer.current !== undefined || request.current || !canChat || !connection.data) return;
    const labels = [
      ...context.skills.map(skill => `Skill: ${connection.data?.skills?.find(item => item.id === skill)?.label ?? skill}`),
      ...(context.agent ? [`Agent: ${connection.data.agents?.find(item => item.id === context.agent)?.label ?? context.agent}`] : []),
      ...context.files.map(file => file.name),
    ];

    const retryTurn = retry.current;
    const turnId = retryTurn && sessionId === retryTurn.sessionId && retryTurn.text === prompt ? retryTurn.turnId : crypto.randomUUID();
    const outgoing: Message = { id: turnId, role: "user", text: prompt, sentAt: new Date(), context: labels };
    setError("");
    setText("");
    setResponding(true);
    if (!demo) {
      const controller = new AbortController();
      request.current = controller;
      void (async () => {
        try {
          const files = await Promise.all(context.files.map(async file => ({ name: file.name, text: await file.text() })));
          if (files.reduce((total, file) => total + file.text.length, 0) > 8000) throw new Error("Total isi lampiran maksimal 8.000 karakter.");
          const activeSession = sessionId ?? (await adminRequest("assistant/sessions", "POST", {}, controller.signal) as { id: string }).id;
          setSessionId(activeSession);
          retry.current = { sessionId: activeSession, text: prompt, turnId };
          setMessages(current => [...current, outgoing]);
          const response: AssistantReply = await adminRequest("assistant/chat", "POST", {
            text: prompt, sessionId: activeSession, turnId, files, skills: context.skills, agent: context.agent,
          }, controller.signal);
          retry.current = null;
          appendReply(response);
          void queryClient.invalidateQueries({ queryKey: assistantSessionsKey });
        } catch (failure) {
          if (controller.signal.aborted) return;
          setMessages(current => current.filter(message => message.id !== outgoing.id));
          setText(current => current || prompt);
          setError(failure instanceof Error ? failure.message : "Balasan belum tersedia. Coba lagi.");
        } finally {
          if (!controller.signal.aborted) setResponding(false);
          request.current = null;
        }
      })();
      return;
    }
    const match = examples.find(item => item.prompt === prompt);
    setMessages(current => [...current, { ...outgoing, demo: true }]);
    timer.current = window.setTimeout(() => {
      appendReply({
        demo: true,
        text: match?.answer ?? "Pesan ini tampil di mode demo. Sambungkan AI untuk mendapat balasan atas pesanmu.",
        changes: match?.changes,
        section: match?.section,
      });
      setResponding(false);
      timer.current = undefined;
    }, 950);
  }

  return (
    <section className={styles.workspace} aria-labelledby="assistant-heading">
      <header className={styles.chatHeader}>
        <span className={styles.icon}><Sparkles size={19} aria-hidden="true" /></span>
        <h1 id="assistant-heading">Asisten Anres</h1>
        <span className={styles.status} role="status">{connection.isPending ? "Memeriksa akses…" : connection.isError ? "Tidak tersedia" : demo ? "Mode demo" : canChat ? "Aktif" : "Belum dikonfigurasi"}</span>
        {!demo && connection.data && <AssistantSessions currentId={sessionId} disabled={responding}
          onNew={() => switchSession()} onOpen={switchSession} onDelete={id => { if (id === sessionId) switchSession(); }} />}
      </header>
      <div ref={conversation} className={styles.conversation} tabIndex={0} role="region" aria-label="Percakapan">
        {!messages.length && !responding && (
          <div className={styles.emptyChat}>
            <span className={styles.welcomeIcon}><Sparkles size={26} aria-hidden="true" /></span>
            <h2>Apa yang bisa saya bantu?</h2>
            {canChat && <div className={styles.examples} role="group" aria-label="Contoh perintah">
              {examples.map(item => (
                <button type="button" key={item.section} onClick={() => {
                  setText(item.prompt);
                  messageInput.current?.focus();
                }}>
                  <item.icon size={15} aria-hidden="true" />{item.title}
                </button>
              ))}
            </div>}
          </div>
        )}
        <div className={styles.transcript} role="log" aria-label="Pesan">
          {messages.map(message => (
            <article key={message.id} className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}>
              <div className={styles.messageBubble}>
                <p>{message.text}</p>
                {!!message.context?.length && <ul className={styles.messageContext}>{message.context.map((label, index) => <li key={index}>{label}</li>)}</ul>}
                {message.changes && <AssistantChanges rows={message.changes} />}
                {message.choices && !!message.choices.length && (
                  <ul className={styles.catalogChoices}>{message.choices.map(item => (
                    <li key={`${item.category}/${item.product}/${item.sku}/${item.name}`}>
                      <strong>{item.name}</strong><span>{item.product} / {item.sku} / {rupiah(item.price)}{item.active ? "" : " / Nonaktif"}</span>
                    </li>
                  ))}</ul>
                )}
                {message.proposal && <AssistantProposal proposal={message.proposal} />}
                {message.batch && <AssistantBatch batch={message.batch} />}
                {!!message.sources?.length && <div className={styles.references}>
                  <strong>Sumber publik · Tavily</strong>
                  <ol>{message.sources.map((source, index) => (
                    <li key={`${source.url}/${index}`}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                    </li>
                  ))}</ol>
                  <small>Dicek <time dateTime={message.sources[0]!.checkedAt}>{new Date(message.sources[0]!.checkedAt).toLocaleString("id-ID")}</time></small>
                </div>}
                {!!message.trace?.length && <details className={styles.references}>
                  <summary>Langkah yang dijalankan ({message.trace.length})</summary>
                  <ol>{message.trace.map(step => <li key={step.tool}>{step.label} · {step.status === "review" ? "Menunggu konfirmasi" : step.status === "done" ? "Selesai" : "Gagal"}</li>)}</ol>
                </details>}
                {message.section && Object.hasOwn(destinations, message.section) && (
                  <button type="button" className="outline-button" onClick={() => onNavigate(message.section!)}>
                    {destinations[message.section]} <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className={styles.messageMeta}>
                <span>{message.role === "user" ? "Kamu" : message.demo ? "Asisten Anres · Demo" : "Asisten Anres"}</span>
                <time dateTime={message.sentAt.toISOString()}>{sentTime.format(message.sentAt)}</time>
              </div>
            </article>
          ))}
          {responding && (
            <div className={`${styles.messageBubble} ${styles.typing}`} role="status">
              <span className="sr-only">Menyiapkan balasan</span>
              <span aria-hidden="true" /><span aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
      {connection.error && <div className={styles.connectionError} role="alert">
        <p>{connection.error.message}</p><button type="button" className="outline-button" onClick={() => void connection.refetch()}>Coba lagi</button>
      </div>}
      {error && <p className={styles.connectionError} role="alert">{error}</p>}
      <AssistantComposer key={draftKey} text={text} onTextChange={setText} onSend={send} responding={responding} messageInput={messageInput}
        demo={demo} attachments={demo || !!connection.data?.attachments} tools={connection.data?.tools ?? []} disabled={!canChat}
        options={connection.data?.skills && connection.data.agents ? { skills: connection.data.skills, agents: connection.data.agents } : undefined} />
    </section>
  );
}
