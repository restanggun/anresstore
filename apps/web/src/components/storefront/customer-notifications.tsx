"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Bell, Check, CheckCheck, Info, MessageCircle, Star, Ticket, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from "@/components/storefront/domain-link";
import { apiUrl } from "@/lib/auth-api";
import { paymentRequest } from "@/lib/payment-api";
import { invoicePath } from "@/lib/payment-navigation";
import type { PaymentRecord } from "./payment-checkout";
import "./customer-notifications.css";

type Notice = { id: string; kind: "support-message" | "support-status" | "review"; title: string; body: string; href: string; createdAt: string; read: boolean };
type Ticket = { id: string; subject: string; status: string; updated_at: string; rejection_reason?: string | null };
type TicketSummary = { count: number; recent: { id: string; subject: string; created_at: string }[] };
type Campaign = { announcementEnabled: boolean; announcementText: string; announcementHref: string; announcementLabel: string; announcementMoving: boolean; startsAt: string | null; endsAt: string | null };
type SavedState = { items: Notice[]; ticketStates: Record<string, string>; supportUnreadCount: number; dismissed: boolean };
type ContextValue = { items: Notice[]; unread: number; dismissed: boolean; campaign: Campaign | null; readError: string; markRead: (id: string) => void; markAllRead: () => void; dismissBanner: () => void; reopenBanner: () => void };
type History = { payments: PaymentRecord[]; userId: string | null };

const storagePrefix = "anres-customer-notifications:";
const emptyState = (): SavedState => ({ items: [], ticketStates: {}, supportUnreadCount: 0, dismissed: false });
const Context = createContext<ContextValue | null>(null);

function readSaved(scope: string): SavedState {
  try {
    const saved = localStorage.getItem(storagePrefix + scope);
    if (!saved) return emptyState();
    const value = JSON.parse(saved) as Partial<SavedState>;
    return {
      items: Array.isArray(value.items) ? value.items.filter(item => item && typeof item.id === "string" && typeof item.href === "string") : [],
      ticketStates: value.ticketStates && typeof value.ticketStates === "object" ? value.ticketStates : {},
      supportUnreadCount: Number.isSafeInteger(value.supportUnreadCount) ? Math.max(0, Number(value.supportUnreadCount)) : 0,
      dismissed: value.dismissed === true,
    };
  } catch { return emptyState(); }
}

async function supportRequest<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const response = await fetch(`${apiUrl}/help/conversations${path}`, { method, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Notifikasi bantuan belum tersedia.");
  return data as T;
}

function ticketHref(id: string) { return `/bantuan?ticket=${encodeURIComponent(id)}#support-inbox`; }
function announcementHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
function openTicket(href: string) {
  const id = new URL(href, window.location.origin).searchParams.get("ticket");
  if (id && /^[a-f0-9-]{36}$/i.test(id)) window.dispatchEvent(new CustomEvent("support-ticket-created", { detail: id }));
}

export function CustomerNotificationsProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedState>(emptyState);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [readError, setReadError] = useState("");
  const savedRef = useRef(saved);
  const scopeRef = useRef("guest");

  const store = useCallback((next: SavedState, owner = scopeRef.current) => {
    savedRef.current = next;
    scopeRef.current = owner;
    setSaved(next);
    try { localStorage.setItem(storagePrefix + owner, JSON.stringify(next)); } catch { /* Keep notifications available for this page view. */ }
  }, []);

  const markRead = useCallback((id: string) => {
    const current = savedRef.current;
    if (!current.items.some(item => item.id === id && !item.read)) return;
    store({ ...current, items: current.items.map(item => item.id === id ? { ...item, read: true } : item) });
  }, [store]);
  const markAllRead = useCallback(() => {
    void (async () => {
      setReadError("");
      const current = savedRef.current;
      const owner = scopeRef.current;
      if (current.supportUnreadCount > 0) {
        try { await supportRequest("/notifications/read", "POST"); }
        catch { setReadError("Pesan CS belum dapat ditandai dibaca. Coba lagi."); return; }
      }
      const latest = scopeRef.current === owner ? savedRef.current : readSaved(owner);
      store({ ...latest, supportUnreadCount: 0, items: latest.items.map(item => ({ ...item, read: true })) }, owner);
    })();
  }, [store]);
  const dismissBanner = useCallback(() => store({ ...savedRef.current, dismissed: true }), [store]);
  const reopenBanner = useCallback(() => store({ ...savedRef.current, dismissed: false }), [store]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch(`${apiUrl}/storefront/landing`, { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.config) setCampaign(data.config as Campaign); })
      .catch(() => {});
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    let active = true;
    let running = false;
    const update = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const results = await Promise.allSettled([
          paymentRequest<History>("transactions?page=0"),
          supportRequest<TicketSummary>("/notifications"),
          supportRequest<{ rows: Ticket[] }>("?page=0"),
        ] as const);
        if (!active) return;

        const history = results[0].status === "fulfilled" ? results[0].value : null;
        if (!history) return;
        const owner = history?.userId || "guest";
        const current = owner === scopeRef.current ? savedRef.current : readSaved(owner);
        const incoming: Notice[] = [];
        const submittedReviews = new Set<string>();

        for (const payment of history?.payments ?? []) {
          const review = payment.review;
          if (!review?.eligible) continue;
          const id = `review:${payment.id}`;
          const href = `${invoicePath(payment.id, payment.invoiceNumber)}#invoice-review`;
          if (review.submitted) {
            submittedReviews.add(id);
            incoming.push({ id, kind: "review", title: "Rating sudah dikirim", body: `Terima kasih telah memberi rating untuk ${payment.product}.`, href, createdAt: payment.createdAt, read: true });
          } else {
            const alreadyHandled = payment.source === "apps" || payment.source === "tasks";
            incoming.push({ id, kind: "review", title: "Pesanan selesai", body: `Beri rating untuk ${payment.product}.`, href, createdAt: payment.createdAt, read: alreadyHandled });
          }
        }

        const summary = results[1].status === "fulfilled" ? results[1].value : null;
        for (const message of summary?.recent ?? []) incoming.push({
          id: `support-message:${message.id}:${message.created_at}`,
          kind: "support-message",
          title: "Pesan baru dari CS",
          body: message.subject,
          href: ticketHref(message.id),
          createdAt: message.created_at,
          read: false,
        });

        let ticketStates = current.ticketStates;
        const tickets = results[2].status === "fulfilled" ? results[2].value.rows : [];
        if (tickets.length) {
          ticketStates = { ...current.ticketStates };
          for (const ticket of tickets) {
            const previous = current.ticketStates[ticket.id];
            const relevant = ticket.status === "in_progress" || ticket.status === "rejected" || ticket.status === "closed";
            const recent = Date.now() - Date.parse(ticket.updated_at) <= 60 * 86400000;
            if (relevant && recent && (previous ? previous !== ticket.status : true)) {
              incoming.push({
                id: `support-status:${ticket.id}:${ticket.status}:${ticket.updated_at}`,
                kind: "support-status",
                title: ticket.status === "rejected" ? "Tiket CS ditolak" : ticket.status === "closed" ? "Tiket CS diselesaikan" : "Tiket diterima CS",
                body: ticket.status === "rejected" && ticket.rejection_reason ? ticket.rejection_reason : ticket.subject,
                href: ticketHref(ticket.id),
                createdAt: ticket.updated_at,
                read: false,
              });
            }
            ticketStates[ticket.id] = ticket.status;
          }
        }

        const existing = new Map(current.items.map(item => [item.id, item]));
        for (const item of incoming) {
          const prior = existing.get(item.id);
          existing.set(item.id, prior ? { ...item, read: prior.read || item.read } : item);
        }
        for (const id of submittedReviews) {
          const prior = existing.get(id);
          if (prior) existing.set(id, { ...prior, title: "Rating sudah dikirim", body: "Terima kasih telah memberi rating.", read: true });
        }
        const items = [...existing.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
        store({ ...current, items, ticketStates, supportUnreadCount: summary?.count ?? current.supportUnreadCount }, owner);
      } catch { /* Keep the last notification snapshot when a service is unavailable. */ }
      finally { running = false; }
    };
    void update();
    const timer = window.setInterval(() => void update(), 15000);
    const refresh = () => void update();
    window.addEventListener("invoice-ownership-updated", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("invoice-ownership-updated", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [store]);

  const unread = saved.supportUnreadCount + saved.items.filter(item => !item.read && item.kind !== "support-message").length;
  return <Context.Provider value={{ items: saved.items, unread, dismissed: saved.dismissed, campaign, readError, markRead, markAllRead, dismissBanner, reopenBanner }}>{children}</Context.Provider>;
}

function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error("Notification components must be inside CustomerNotificationsProvider.");
  return value;
}

function campaignIsActive(campaign: Campaign | null) {
  if (!campaign?.announcementEnabled || !campaign.announcementText?.trim()) return false;
  const now = Date.now();
  return !(campaign.startsAt && Date.parse(campaign.startsAt) > now) && !(campaign.endsAt && Date.parse(campaign.endsAt) <= now);
}

export function NotificationBanner() {
  const { items, dismissed, campaign, markRead, dismissBanner, reopenBanner } = useNotifications();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const unread = items.find(item => !item.read);
  const useCampaign = !unread && campaignIsActive(campaign);

  useEffect(() => {
    const parent = viewport.current;
    const child = content.current;
    if (!parent || !child) return;
    const measure = () => setOverflowing(child.scrollWidth > parent.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(child);
    return () => observer.disconnect();
  }, [unread?.id, campaign?.announcementText, campaign?.announcementLabel]);

  if (dismissed || (!unread && !useCampaign)) return null;

  const title = unread?.title ?? campaign?.announcementText ?? "";
  const body = unread?.body ?? "";
  const href = unread?.href ?? announcementHref(campaign?.announcementHref ?? "");
  const label = unread ? "Lihat" : campaign?.announcementLabel ?? "";
  const visible = <><strong>{title}</strong>{body && <span> · {body}</span>}{href && <span className="customer-notice-action">{label || "Lihat"}<ArrowUpRight size={13} aria-hidden="true"/></span>}</>;

  return <div className="customer-notice-bar" role="region" aria-label={unread ? "Notifikasi terbaru" : "Pengumuman Anres"} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <button className="customer-notice-close" type="button" aria-label="Tutup banner notifikasi" onClick={dismissBanner}><X size={17} aria-hidden="true"/></button>
    <div className="customer-notice-viewport" ref={viewport} aria-live="off">
      <div className={`customer-notice-track${overflowing && !hovered && !focused ? " is-moving" : ""}`}>
        {href ? <Link href={href} className="customer-notice-link" onClick={() => unread && markRead(unread.id)}><span className="customer-notice-copy" ref={content}>{visible}</span></Link> : <span className="customer-notice-copy" ref={content}>{visible}</span>}
        {href ? <Link href={href} className="customer-notice-link customer-notice-copy" aria-hidden="true" tabIndex={-1} onClick={() => unread && markRead(unread.id)}>{visible}</Link> : <span className="customer-notice-copy" aria-hidden="true">{visible}</span>}
      </div>
    </div>
  </div>;
}

const noticeIcon = (kind: Notice["kind"]) => kind === "review" ? Star : kind === "support-message" ? MessageCircle : Ticket;
const dateLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function NotificationBell() {
  const { items, unread, dismissed, campaign, readError, markRead, markAllRead, reopenBanner } = useNotifications();
  const [open, setOpen] = useState(false);
  const announcement = campaignIsActive(campaign) ? {
    id: "campaign-announcement", kind: "campaign" as const, title: campaign!.announcementText, body: campaign!.announcementLabel,
    href: announcementHref(campaign!.announcementHref), createdAt: campaign!.startsAt || "1970-01-01T00:00:00.000Z", read: true,
  } : null;
  const visibleItems = [...items, ...(announcement ? [announcement] : [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (!dismissed) return null;
  return <>
    <button className="customer-notice-bell" type="button" aria-label={`Buka notifikasi, ${unread} belum dibaca`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <Bell size={19} aria-hidden="true"/>
      {unread > 0 && <span className="customer-notice-count" aria-label={`${unread} belum dibaca`}>{unread > 99 ? "99+" : unread}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="customer-notice-dialog" showCloseButton={false}>
        <DialogHeader className="customer-notice-dialog-heading">
          <div><DialogTitle>Notifikasi</DialogTitle><DialogDescription>{unread ? `${unread} belum dibaca` : "Semua notifikasi sudah dibaca."}</DialogDescription></div>
          <div className="customer-notice-dialog-actions">
            {unread > 0 && <button type="button" onClick={markAllRead}><CheckCheck size={15} aria-hidden="true"/>Tandai dibaca</button>}
            <DialogClose asChild><button type="button" className="customer-notice-dialog-close" aria-label="Tutup notifikasi"><X size={19} aria-hidden="true"/></button></DialogClose>
          </div>
        </DialogHeader>
        {readError && <p className="customer-notice-read-error" role="alert">{readError}</p>}
        {!visibleItems.length ? <div className="customer-notice-empty"><span><Bell size={23} aria-hidden="true"/></span><strong>Belum ada notifikasi</strong><p>Pesan CS dan ajakan rating pesanan selesai akan tampil di sini.</p></div> : <div className="customer-notice-list" aria-label="Daftar notifikasi lengkap">
          {visibleItems.map(item => {
            const Icon = item.kind === "campaign" ? Info : noticeIcon(item.kind);
            const content = <><span className={`customer-notice-item-icon${item.kind === "review" ? " is-review" : item.kind === "campaign" ? " is-campaign" : ""}`}><Icon size={17} aria-hidden="true"/></span><span className="customer-notice-item-copy"><strong>{item.title}</strong><span>{item.body}</span><time dateTime={item.createdAt}>{dateLabel.format(new Date(item.createdAt))} WIB</time></span>{!item.read && <i className="customer-notice-unread-dot" aria-label="Belum dibaca"/>}</>;
            return item.href ? <DialogClose asChild key={item.id}><Link className={`customer-notice-item${item.read ? " is-read" : ""}`} href={item.href} onClick={() => { if (item.kind === "campaign") reopenBanner(); else { markRead(item.id); if (item.kind.startsWith("support-")) openTicket(item.href); } }}>{content}<span className="sr-only">Buka notifikasi</span></Link></DialogClose> : <button className={`customer-notice-item${item.read ? " is-read" : ""}`} type="button" key={item.id} onClick={() => markRead(item.id)}>{content}<Check size={15} aria-hidden="true"/></button>;
          })}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
