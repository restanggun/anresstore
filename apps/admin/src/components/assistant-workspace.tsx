"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Box, MessageSquare, ShoppingBag, Sparkles } from "lucide-react";
import { AssistantChanges } from "./assistant-changes";
import { AssistantComposer, type ComposerContext } from "./assistant-composer";
import { AssistantProposal, type AssistantProposalData, type AssistantVariant } from "./assistant-proposal";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./assistant-workspace.module.css";

const examples = [
  {
    title: "Katalog & harga", icon: Box, section: "catalog", link: "Buka katalog",
    prompt: "Naikkan harga 86 Diamonds Mobile Legends jadi Rp27.000.",
    answer: "Varian 86 Diamonds ditemukan. Tinjau perubahan harga dasar dan harga yang dilihat pelanggan selama promo aktif.",
    changes: [
      { label: "Harga dasar", before: "Rp25.000", after: "Rp27.000" },
      { label: "Harga selama promo", before: "Rp23.000", after: "Rp23.000" },
    ],
  },
  {
    title: "Pesanan & pemenuhan", icon: ShoppingBag, section: "fulfillment", link: "Buka antrean",
    prompt: "Pesanan mana yang sudah lunas tapi belum dikirim?",
    answer: "Ada 3 pesanan lunas dalam contoh antrean ini. Dua siap dikirim dan satu masih menunggu tinjauan manual.",
  },
  {
    title: "Laporan transaksi", icon: BarChart3, section: "reports", link: "Buka laporan",
    prompt: "Ringkas transaksi tujuh hari terakhir.",
    answer: "Dalam contoh periode ini, 24 pembayaran terverifikasi dengan total Rp1.250.000. Buka laporan untuk melihat data toko.",
  },
  {
    title: "Bantuan pelanggan", icon: MessageSquare, section: "conversations", link: "Buka room chat CS",
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
};

const sentTime = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const destinations = {
  catalog: "Buka katalog", fulfillment: "Buka antrean", orders: "Buka pesanan", payments: "Buka pembayaran",
  reports: "Buka laporan", system: "Buka status sistem", conversations: "Buka room chat CS",
  vouchers: "Buka voucher", overview: "Buka ringkasan", tasks: "Buka joki tugas", apps: "Buka aplikasi premium",
};
type AssistantStatus = { configured: boolean; attachments: boolean; tools: string[] };
type AssistantReply = Pick<Message, "text" | "section" | "choices" | "proposal">;

export function AssistantWorkspace({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const example = examples[selected ?? 0]!;
  const connection = useQuery({
    queryKey: ["admin-assistant"],
    queryFn: ({ signal }) => adminRequest("assistant", "GET", undefined, signal) as Promise<AssistantStatus>,
    retry: false,
  });
  const demo = connection.data?.configured === false;

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    request.current?.abort();
  }, []);
  useEffect(() => {
    const log = conversation.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, responding]);

  function appendReply(result: AssistantReply & Pick<Message, "demo" | "changes">) {
    const reply: Message = { ...result, id: crypto.randomUUID(), role: "assistant", sentAt: new Date() };
    setMessages(current => [...current, reply]);
  }

  function send(context: ComposerContext) {
    const prompt = text.trim();
    if (!prompt || timer.current !== undefined || request.current || !connection.data) return;
    const labels = [
      ...context.skills.map(skill => `Skill: ${skill}`),
      ...(context.agent ? [`Agent: ${context.agent}`] : []),
      ...context.files.map(file => file.name),
    ];

    const outgoing: Message = { id: crypto.randomUUID(), role: "user", text: prompt, sentAt: new Date(), context: labels };
    setError("");
    setText("");
    setResponding(true);
    if (!demo) {
      const controller = new AbortController();
      const history = messages.filter(message => message.role === "user" && !message.demo).slice(-6).map(message => message.text.slice(0, 1500));
      request.current = controller;
      void (async () => {
        try {
          const files = await Promise.all(context.files.map(async file => ({ name: file.name, text: await file.text() })));
          if (files.reduce((total, file) => total + file.text.length, 0) > 8000) throw new Error("Total isi lampiran maksimal 8.000 karakter.");
          setMessages(current => [...current, outgoing]);
          const response: AssistantReply = await adminRequest("assistant/chat", "POST", {
            text: prompt, history, files, skills: context.skills, agent: context.agent,
          }, controller.signal);
          appendReply(response);
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
        text: match?.answer ?? "Pesan ini hanya tampil di pratinjau. Pilih salah satu contoh untuk melihat balasan demo Asisten Anres.",
        changes: match?.changes,
      });
      setResponding(false);
      timer.current = undefined;
    }, 950);
  }

  return (
    <section className={styles.workspace}>
      <div className="workspace-heading">
        <div>
          <h1>Asisten Anres</h1>
          <p>Tinjau perubahan katalog, pantau pesanan, dan siapkan draf balasan.</p>
        </div>
      </div>
      <div className={styles.layout}>
        <section className={styles.panel} aria-labelledby="assistant-conversation">
          <header className={`${styles.panelHeader} ${styles.chatHeader}`}>
            <span className={styles.icon}><Sparkles size={18} aria-hidden="true" /></span>
            <div><h2 id="assistant-conversation">Percakapan</h2><p>{demo ? "AI belum terhubung" : "Akses mengikuti izin admin"}</p></div>
            <span className={styles.status}>{connection.isPending ? "Memeriksa akses…" : connection.isError ? "Tidak tersedia" : demo ? "Mode demo" : "Asisten aktif"}</span>
          </header>
          <div ref={conversation} className={styles.conversation} role="log" aria-label="Percakapan" tabIndex={0}>
            {!messages.length && (
              <div className={styles.emptyChat}>
                <span className={styles.icon}><Sparkles size={21} aria-hidden="true" /></span>
                <strong>Apa yang ingin kamu kerjakan?</strong>
                <p>{demo ? "Pilih contoh atau tulis pesan untuk mencoba alur percakapan." : "Tanyakan pesanan atau buat draf perubahan katalog."}</p>
              </div>
            )}
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
          {connection.error && <div className={styles.connectionError} role="alert">
            <p>{connection.error.message}</p><button type="button" className="outline-button" onClick={() => void connection.refetch()}>Coba lagi</button>
          </div>}
          {error && <p className={`${styles.chatError} ${styles.connectionError}`} role="alert">{error}</p>}
          <AssistantComposer text={text} onTextChange={setText} onSend={send} responding={responding} messageInput={messageInput}
            demo={demo} attachments={demo || !!connection.data?.attachments} tools={connection.data?.tools ?? []} disabled={!connection.data} />
        </section>
        <aside className={styles.panel} aria-labelledby="assistant-examples">
          <header className={styles.panelHeader}><h2 id="assistant-examples">Coba contoh</h2></header>
          <div className={styles.examples} role="group" aria-label="Pilih contoh percakapan">
            {examples.map((item, index) => (
              <button type="button" key={item.section} aria-pressed={selected === index} onClick={() => {
                setSelected(index);
                setText(item.prompt);
                messageInput.current?.focus();
              }}>
                <item.icon size={17} aria-hidden="true" /><span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className={styles.destination}>
            <button className="outline-button" type="button" onClick={() => onNavigate(example.section)}>
              {example.link} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
