"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Bell, FileText, MessageCircle, ShoppingBag, Star, X } from "lucide-react";
import { adminRequest } from "./workspace-api";
import "./support-notifications.css";

type Ticket = { id: string; subject: string; created_at: string };
type SupportSummary = { count: number; unreadCount?: number; recent: Ticket[]; recentMessages?: Ticket[] };
export type WorkSection = "orders" | "tasks" | "apps" | "reviews";
type WorkEntry = {
  id: string;
  subject: string;
  invoice_number: string | null;
  notification_at: string;
  reason: string | null;
  unread: boolean;
};
export type WorkSummary = {
  section: WorkSection;
  count: number;
  unread_count: number;
  snapshot_at: string;
  recent: WorkEntry[];
};

const workKey = ["admin-work-notifications"];
const workLabels = {
  orders: { label: "Pesanan & invoice", arrival: "Pesanan baru", icon: ShoppingBag },
  tasks: { label: "Joki tugas", arrival: "Pesanan joki tugas", icon: FileText },
  apps: { label: "Aplikasi premium", arrival: "Pesanan aplikasi premium", icon: AppWindow },
  reviews: { label: "Rating & ulasan", arrival: "Rating baru", icon: Star },
};
const notificationDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

function useTickets() {
  return useQuery<SupportSummary>({
    queryKey: ["support-notifications"],
    queryFn: ({ signal }) => adminRequest("conversations/notifications", "GET", undefined, signal),
    refetchInterval: 5000,
    retry: false,
  });
}

export function useWorkNotifications() {
  const client = useQueryClient();
  const query = useQuery<{ sections: WorkSummary[] }>({
    queryKey: workKey,
    queryFn: ({ signal }) => adminRequest("work-notifications", "GET", undefined, signal),
    refetchInterval: 5000,
    retry: false,
  });
  const { mutate: markRead, error: readError } = useMutation({
    mutationFn: ({ section, snapshot_at }: WorkSummary) =>
      adminRequest(`work-notifications/${section}/read`, "POST", { through: snapshot_at }),
    onSuccess: () => client.invalidateQueries({ queryKey: workKey }),
  });
  const { mutate: markItemRead } = useMutation({
    mutationFn: ({ section, id }: { section: WorkSection; id: string }) =>
      adminRequest(`work-notifications/${section}/read-item`, "POST", { id }),
    onSuccess: () => client.invalidateQueries({ queryKey: workKey }),
  });

  const read = useCallback((section: string) => {
    const data = client.getQueryData<{ sections: WorkSummary[] }>(workKey);
    const summary = data?.sections.find(item => item.section === section);
    if (summary?.unread_count) markRead(summary);
  }, [client, markRead]);

  const readItem = useCallback((section: WorkSection, id: string) => markItemRead({ section, id }), [markItemRead]);

  return { query, readError, read, readItem };
}

export function NotificationCount({ count, label }: { count: number; label?: string }) {
  if (!count) return null;
  return <span className="cs-count-badge">
    <span aria-hidden={label ? true : undefined}>{count > 99 ? "99+" : count}</span>
    {label && <span className="sr-only">{label}</span>}
  </span>;
}

export function SupportTicketBadge() {
  const { data } = useTickets();
  const count = data?.count ?? 0;
  const unread = data?.unreadCount ?? 0;
  return <NotificationCount count={count + unread} label={`${count} tiket baru, ${unread} chat belum dibaca`} />;
}

type Arrival = { title: string; detail: string; section?: string };

function combineArrivals(current: Arrival | null, next: Arrival): Arrival {
  if (!current || current.section === next.section) return next;
  return { title: "Aktivitas baru di dashboard", detail: "Buka notifikasi untuk melihat pemberitahuan terbaru." };
}

export function SupportNotifications({ onNavigate, systemAlerts = 0, work }: {
  onNavigate: (section: string, itemId?: string) => void;
  systemAlerts?: number;
  work: ReturnType<typeof useWorkNotifications>;
}) {
  const tickets = useTickets();
  const supportCount = (tickets.data?.count ?? 0) + (tickets.data?.unreadCount ?? 0);
  const summaries = work.query.data?.sections;
  const workCount = summaries?.reduce((total, summary) => total + summary.count, 0) ?? 0;
  const [open, setOpen] = useState(false);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const toast = useRef<HTMLDivElement>(null);
  const previousTickets = useRef<SupportSummary | undefined>(undefined);
  const previousWork = useRef<WorkSummary[] | undefined>(undefined);

  useEffect(() => {
    const current = tickets.data;
    if (!current) return;
    const previous = previousTickets.current;
    previousTickets.current = current;
    if (!previous) return;
    const oldChats = new Set(previous.recentMessages?.map(item => `${item.id}:${item.created_at}`));
    const newChat = current.recentMessages?.some(item => !oldChats.has(`${item.id}:${item.created_at}`));
    const difference = (current.count + (current.unreadCount ?? 0)) - (previous.count + (previous.unreadCount ?? 0));
    if (difference > 0 || newChat) {
      setArrival(current => combineArrivals(current, {
        title: `${Math.max(difference, 1)} notifikasi CS baru`, detail: "Ada tiket atau pesan pelanggan yang perlu dibaca.", section: "conversations",
      }));
    }
  }, [tickets.data]);

  useEffect(() => {
    if (!summaries) return;
    const previous = previousWork.current;
    previousWork.current = summaries;
    if (!previous) return;
    const changed = summaries.flatMap(summary => {
      const old = previous.find(item => item.section === summary.section);
      if (!old) return [];
      const oldReasons = new Map(old.recent.map(entry => [entry.id, entry.reason]));
      return summary.recent.filter(entry =>
        oldReasons.get(entry.id) !== entry.reason &&
        Date.parse(entry.notification_at) >= Date.parse(old.snapshot_at)
      ).map(entry => ({ ...entry, section: summary.section }));
    });
    const first = changed[0];
    if (!first) return;
    setArrival(current => combineArrivals(current, {
      title: changed.length === 1 ? (first.reason ?? workLabels[first.section].arrival) : "Aktivitas baru di dashboard",
      detail: changed.length === 1 ? first.subject : "Buka notifikasi untuk melihat pesanan dan ulasan terbaru.",
      section: changed.every(entry => entry.section === first.section) ? first.section : undefined,
    }));
  }, [summaries]);

  useEffect(() => {
    const element = toast.current;
    if (!arrival || !element) return;
    element.showPopover?.();
    let timer: ReturnType<typeof setTimeout>;
    const dismiss = () => {
      if (element.matches(":focus-within")) timer = setTimeout(dismiss, 1000);
      else setArrival(null);
    };
    timer = setTimeout(dismiss, 7000);
    return () => clearTimeout(timer);
  }, [arrival]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function closePanel() {
    setOpen(false);
    bell.current?.focus();
  }

  function navigate(section: string, itemId?: string) {
    closePanel();
    setArrival(null);
    onNavigate(section, itemId);
  }

  const supportEntries = [
    ...(tickets.data?.recent ?? []).map(item => ({ ...item, kind: "Tiket baru" })),
    ...(tickets.data?.recentMessages ?? []).map(item => ({ ...item, kind: "Chat baru" })),
  ];
  const workEntries = (summaries ?? []).flatMap(summary =>
    summary.recent.map(entry => ({ ...entry, section: summary.section }))
  ).sort((a, b) => Date.parse(b.notification_at) - Date.parse(a.notification_at));
  const total = supportCount + workCount + systemAlerts;

  return <div className="cs-notifications" ref={host}>
    <button ref={bell} type="button" className="notification-button" aria-label={`Notifikasi dashboard, ${total} pemberitahuan`}
      aria-expanded={open} aria-controls="cs-notifications-panel" onClick={() => setOpen(value => !value)}>
      <Bell size={20} aria-hidden="true" /><NotificationCount count={total} />
    </button>
    {open && <section className="cs-notification-panel" id="cs-notifications-panel" aria-label="Notifikasi dashboard">
      <header>
        <div><h2>Notifikasi</h2><p>{supportCount} tiket atau chat CS · {workCount} pesanan atau ulasan</p></div>
        <button type="button" aria-label="Tutup notifikasi" onClick={closePanel}><X size={18} aria-hidden="true" /></button>
      </header>
      {tickets.isPending && work.query.isPending && <p className="cs-notification-empty" role="status">Memuat notifikasi...</p>}
      {tickets.isError && <div className="cs-notification-empty"><p>Notifikasi CS belum dapat dimuat.</p><button type="button" onClick={() => void tickets.refetch()}>Coba lagi</button></div>}
      {work.query.isError && <div className="cs-notification-empty"><p>Notifikasi pesanan dan ulasan belum dapat dimuat.</p><button type="button" onClick={() => void work.query.refetch()}>Coba lagi</button></div>}
      {work.readError && <p className="cs-notification-empty" role="status">Status dibaca belum tersimpan. Buka kembali menu untuk mencoba lagi.</p>}
      {!total && tickets.isSuccess && work.query.isSuccess && <p className="cs-notification-empty">Tidak ada notifikasi baru atau pesanan yang perlu ditangani.</p>}
      <div className="cs-notification-list">
        {supportEntries.map(ticket => <button type="button" key={`cs:${ticket.kind}:${ticket.id}`} onClick={() => navigate("conversations")}>
          <span className="cs-notification-icon"><MessageCircle size={18} aria-hidden="true" /></span>
          <span><strong>{ticket.subject}</strong><small>{ticket.kind} · {notificationDate.format(new Date(ticket.created_at))}</small></span>
          <i aria-hidden="true" />
        </button>)}
        {workEntries.slice(0, 5).map(entry => {
          const { label, arrival: arrivalLabel, icon: Icon } = workLabels[entry.section];
          return <button type="button" key={`${entry.section}:${entry.id}`} onClick={() => navigate(entry.section, entry.id)}>
            <span className="cs-notification-icon"><Icon size={18} aria-hidden="true" /></span>
            <span>
              <strong>{entry.subject}</strong>
              <small>{label} · {entry.reason ?? arrivalLabel}{entry.unread && entry.reason ? " · Baru" : ""}</small>
              <small>{entry.invoice_number && `${entry.invoice_number} · `}{notificationDate.format(new Date(entry.notification_at))}</small>
            </span>
            <i aria-hidden="true" />
          </button>;
        })}
      </div>
      {systemAlerts > 0 && <button type="button" className="cs-system-alert" onClick={() => navigate("system")}>{systemAlerts} masalah koneksi sistem · Periksa</button>}
      <footer><button type="button" onClick={() => navigate("conversations")}>Lihat semua tiket CS</button></footer>
    </section>}
    <span className="sr-only" role="status">{arrival && `${arrival.title}. ${arrival.detail}`}</span>
    {arrival && <div className="cs-ticket-toast" ref={toast} popover="manual" aria-label="Pemberitahuan baru" role="region">
      <Bell size={21} aria-hidden="true" />
      <div><strong>{arrival.title}</strong><p>{arrival.detail}</p></div>
      <button type="button" onClick={() => {
        if (arrival.section) navigate(arrival.section);
        else { setArrival(null); setOpen(true); bell.current?.focus(); }
      }}>{arrival.section === "conversations" ? "Lihat tiket" : "Lihat"}</button>
      <button type="button" aria-label="Tutup pemberitahuan" onClick={() => { setArrival(null); bell.current?.focus(); }}><X size={16} aria-hidden="true" /></button>
    </div>}
  </div>;
}
