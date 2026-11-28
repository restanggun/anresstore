"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import Link from "./domain-link";
import { withSupportInvoice } from "@/lib/domains";
import {apiUrl, AuthRequestError, authRequest} from "@/lib/auth-api";
import {SupportChatDialog} from "@anres/ui";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import "./support-ticket-panel.css";
type Room={id:string;subject:string;status:string;created_at:string;user_id?:string;rejection_reason?:string};
type Message={id:string;body:string;author_role:string;created_at:string};
const labels:Record<string,string>={new:"Menunggu koneksi CS",in_progress:"Terhubung dengan CS",rejected:"Tiket ditolak",closed:"Selesai"};
export async function supportCall(path:string,method="GET",body?:unknown,signal?:AbortSignal){
 const res=await fetch(`${apiUrl}/help/conversations${path}`,{method,credentials:"include",cache:"no-store",signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await res.json().catch(()=>null);if(!res.ok)throw new AuthRequestError(data?.message||"Permintaan gagal. Coba lagi.",res.status);return data;
}
export function SupportInbox({ invoiceReference }: { invoiceReference?: string | null }){
 const [invoiceLoading,setInvoiceLoading]=useState(Boolean(invoiceReference));
 const [invoiceNumber,setInvoiceNumber]=useState<string | null>(null);
 const [activeTicketId,setActiveTicketId]=useState<string | null>(null);
 const [invoiceNotice,setInvoiceNotice]=useState("");
 const [invoiceAttempt,setInvoiceAttempt]=useState(0);
 const [open,setOpen]=useState(false);
 const [notifications,setNotifications]=useState<{count:number;recent:{id:string;subject:string;created_at:string}[]}>({count:0,recent:[]});
 const [chatAlert,setChatAlert]=useState("");const lastChat=useRef<string|null>(null);
 const [historyPage,setHistoryPage]=useState(0),[older,setOlder]=useState(false);
 const [rooms,setRooms]=useState<Room[]>([]),[room,setRoom]=useState<Room|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [subject,setSubject]=useState(""),[details,setDetails]=useState(""),[draft,setDraft]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loggedIn,setLoggedIn]=useState(false),[loading,setLoading]=useState(true);
 const [page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[refresh,setRefresh]=useState(0);
 const pendingCreate=useRef<{id:string;subject:string;body:string}|null>(null),pendingSend=useRef<{id:string;body:string}|null>(null);
 useEffect(()=>{let active=true,version=0;const show=async(event:Event)=>{const id=(event as CustomEvent<string>).detail;if(!id||!/^[a-f0-9-]{36}$/i.test(id))return;const current=++version;try{const {user}=await authRequest<{user:{id:string}|null}>("session");if(!user||!active||current!==version)return;const data=await supportCall(`/${id}/messages?page=0`);if(active&&current===version){setRoom(data.room);setMessages(data.rows);setOlder(data.hasMore);setHistoryPage(0);setPage(0);setRefresh(v=>v+1);setDraft("");setNotice("");setOpen(true);}}catch(e){if(active)setNotice((e as Error).message);}};window.addEventListener("support-ticket-created",show);const ticket=new URLSearchParams(window.location.search).get("ticket");if(ticket&&/^[a-f0-9-]{36}$/i.test(ticket)){void show(new CustomEvent("support-ticket-created",{detail:ticket}));const url=new URL(window.location.href);url.searchParams.delete("ticket");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);}return()=>{active=false;window.removeEventListener("support-ticket-created",show);};},[]);
 useEffect(()=>{
  let active=true, running=false;
  let timer: ReturnType<typeof setInterval> | undefined;
  function endSession() {
   clearInterval(timer);
   setLoggedIn(false);
   setOpen(false);
   setRoom(null);
   setRooms([]);
   setMessages([]);
   setNotifications({count:0,recent:[]});
   setChatAlert("");
   setNotice("");
   lastChat.current=null;
  }
  async function load() {
   if(running)return;
   running=true;
   try {
    const [data,summary]=await Promise.all([supportCall(`?page=${page}`),supportCall("/notifications")]);
    if(!active)return;
    setRooms(data.rows);
    setHasMore(data.hasMore);
    setLoggedIn(true);
    if(typeof summary.count==="number"&&Array.isArray(summary.recent)){
     setNotifications(summary);
     const latest=summary.recent.map((t:{id:string;created_at:string})=>`${t.id}:${t.created_at}`).join("|");
     if(lastChat.current!==null&&latest&&latest!==lastChat.current)setChatAlert("Pesan baru dari tim CS.");
     lastChat.current=latest;
    }
   } catch(error) {
    if(!active)return;
    if(error instanceof AuthRequestError&&error.status===401)endSession();
    else setNotice((error as Error).message);
   } finally {
    running=false;
    if(active)setLoading(false);
   }
  }
  async function start() {
   try {
    const {user}=await authRequest<{user:{id:string}|null}>("session");
    if(!active)return;
    if(!user){endSession();return;}
    timer=setInterval(()=>void load(),5000);
    await load();
   } catch(error) {
    if(active)setNotice((error as Error).message);
   } finally {
    if(active)setLoading(false);
   }
  }
  void start();
  return()=>{active=false;clearInterval(timer);};
 },[page,refresh]);
 useEffect(()=>{if(!room||!open)return;let active=true;const id=room.id;async function read(){try{const data=await supportCall(`/${id}/messages?page=${historyPage}`);if(active){setMessages(data.rows);setRoom(data.room);setOlder(data.hasMore);if(["closed","rejected"].includes(data.room.status))setActiveTicketId(current=>current===id?null:current);}}catch(e){if(active)setNotice((e as Error).message);}}void read();const timer=setInterval(()=>void read(),5000);return()=>{active=false;clearInterval(timer);};},[room?.id,historyPage,open]);
 useEffect(() => {
  if (!invoiceReference) return;
  const controller = new AbortController();
  const signal = controller.signal;
  const load = async () => {
   try {
    const context = await supportCall(`/invoice/${encodeURIComponent(invoiceReference)}`, "GET", undefined, signal) as {
      invoiceNumber: string; ticketId: string | null;
    };
    const data = context.ticketId ? await supportCall(`/${context.ticketId}/messages?page=0`, "GET", undefined, signal) : null;
    if (signal.aborted) return;
    setLoggedIn(true);
    setInvoiceNumber(context.invoiceNumber);
    setActiveTicketId(context.ticketId);
    setSubject(`Kendala invoice ${context.invoiceNumber}`);
    if (data) {
     setRoom(data.room);
     setMessages(data.rows);
     setOlder(data.hasMore);
    }
    setOpen(true);
   } catch (error) {
    if (signal.aborted) return;
    if (error instanceof AuthRequestError && error.status === 401) setLoggedIn(false);
    else setInvoiceNotice(error instanceof Error ? error.message : "Tiket invoice belum dapat dibuka.");
   } finally {
    if (!signal.aborted) setInvoiceLoading(false);
   }
  };
  void load();
  return () => controller.abort();
 }, [invoiceReference, invoiceAttempt]);
 async function create(event: FormEvent) {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  setNotice("");
  const payload = pendingCreate.current?.subject === subject && pendingCreate.current.body === details
    ? pendingCreate.current : { id: crypto.randomUUID(), subject, body: details };
  pendingCreate.current = payload;
  try {
   const reference = invoiceNumber && invoiceReference ? `/invoice/${encodeURIComponent(invoiceReference)}` : "";
   const result = await supportCall(reference, "POST", payload) as { id: string; reused?: boolean };
   if (reference) setActiveTicketId(result.id);
   if (result.reused) {
    const latest = await supportCall(`/${result.id}/messages?page=0`);
    setRoom(latest.room);
    setMessages(latest.rows);
    setOlder(latest.hasMore);
    setDraft(details);
    setNotice("Tiket untuk invoice ini sudah tersedia. Kirim rincianmu dari kotak pesan.");
   } else {
    setMessages([]);
    setOlder(false);
    setDraft("");
    setRoom({ id: result.id, subject, status: "new", created_at: new Date().toISOString() });
   }
   setSubject("");
   setDetails("");
   setHistoryPage(0);
   setRefresh(value => value + 1);
   pendingCreate.current = null;
  } catch (error) {
   if (error instanceof AuthRequestError && error.status === 401 && invoiceReference) setLoggedIn(false);
   setNotice(error instanceof Error ? error.message : "Tiket belum dapat dibuat.");
  } finally { setBusy(false); }
 }
 function startTicket() {
  if (activeTicketId) {
   window.dispatchEvent(new CustomEvent("support-ticket-created", { detail: activeTicketId }));
   return;
  }
  setRoom(null);
  setSubject(invoiceNumber ? `Kendala invoice ${invoiceNumber}` : "");
  setDetails("");
  pendingCreate.current = null;
  setOpen(true);
  setMessages([]);
  setNotice("");
 }
 async function send(e:FormEvent){e.preventDefault();if(!room||busy)return;setBusy(true);setNotice("");const payload=pendingSend.current?.body===draft?pendingSend.current:{id:crypto.randomUUID(),body:draft};pendingSend.current=payload;try{await supportCall(`/${room.id}/messages`,"POST",payload);setDraft("");pendingSend.current=null;setHistoryPage(0);const data=await supportCall(`/${room.id}/messages?page=0`);setMessages(data.rows);setRoom(data.room);}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 return <section id="support-inbox" className="support-inbox" aria-labelledby="support-inbox-title">
  <h2 id="support-inbox-title">Tiket dan chat CS</h2><p>Buat tiket dan tunggu tim CS menerima permintaanmu. Jangan kirim password atau kode OTP.</p>
    {invoiceNotice && <p role="alert">{invoiceNotice} <button type="button" onClick={() => {
    setInvoiceNotice(""); setInvoiceLoading(true); setInvoiceAttempt(attempt => attempt + 1);
  }}>Coba lagi</button></p>}
  {notice && !open && <p role="alert">{notice}</p>}
  {invoiceLoading || loading && !loggedIn ? <p role="status">Memuat tiket...</p> : !loggedIn ?
    <Link href={withSupportInvoice("/login", invoiceReference)}>{invoiceReference ? "Masuk untuk melanjutkan ke tiket CS" : "Masuk untuk membuka tiket"}</Link> : <>
   {(notifications.count>0||chatAlert)&&<div className="support-chat-notice" role="status"><span>{chatAlert||`Ada pesan dari CS pada ${notifications.count} tiket.`}</span>{notifications.recent[0]&&<button type="button" onClick={()=>{const target=notifications.recent[0];if(!target)return;setChatAlert("");window.dispatchEvent(new CustomEvent("support-ticket-created",{detail:target.id}));}}>Buka chat</button>}<button type="button" aria-label="Tutup pemberitahuan chat" onClick={()=>setChatAlert("")}>×</button></div>}
   <div className="support-room-list">{rooms.map(r=><button type="button" key={r.id} aria-pressed={open&&room?.id===r.id} disabled={busy} onClick={()=>{setMessages([]);setRoom(r);setOpen(true);setDraft("");pendingSend.current=null;setHistoryPage(0);setNotice("");}}>{r.subject} · {labels[r.status]}{notifications.recent.some(t=>t.id===r.id)&&<span className="support-unread-dot" aria-label="Pesan baru dari CS"/>}</button>)}</div>
   {!rooms.length&&<p>Belum ada tiket pada halaman ini.</p>}
   <div className="support-room-list"><button type="button" disabled={busy} onClick={startTicket}>{activeTicketId ? "Buka tiket invoice" : "+ Tiket / Room chat"}</button><button type="button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Tiket sebelumnya</button><button type="button" disabled={!hasMore} onClick={()=>setPage(p=>p+1)}>Tiket berikutnya</button></div>
   {room?<SupportChatDialog open={open} onClose={()=>setOpen(false)} ticket={room} messages={messages} viewer="customer" draft={draft} onDraftChange={setDraft} onSend={e=>void send(e)} busy={busy} notice={notice} historyPage={historyPage} hasOlder={older} onOlder={()=>setHistoryPage(p=>p+1)} onNewer={()=>setHistoryPage(p=>Math.max(0,p-1))}><p className="shared-chat-customer-note">{room.status==="new"?"Tiketmu sudah masuk antrean. Tunggu tim CS menerima permintaan bantuanmu.":room.status==="in_progress"?"Kamu sudah terhubung dengan tim CS. Lanjutkan percakapan di sini.":"Buat tiket baru jika masih membutuhkan bantuan."}</p></SupportChatDialog>:<Dialog open={open && loggedIn} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="support-inbox support-popup support-create-popup"><DialogTitle><span id="support-create-title">Buat tiket CS</span></DialogTitle><DialogDescription>Isi kebutuhanmu. Tim CS akan menerima tiket sebelum memulai percakapan.</DialogDescription>{notice&&<p role="alert">{notice}</p>}<form className="support-create-form" method="post" aria-labelledby="support-create-title" onSubmit={e=>void create(e)}>{invoiceNumber && <label htmlFor="support-invoice-number">Nomor invoice<input id="support-invoice-number" name="invoiceNumber" value={invoiceNumber} readOnly /></label>}<label htmlFor="support-subject">Subjek bantuan<input id="support-subject" name="subject" required minLength={3} maxLength={160} disabled={busy} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Contoh: perlu bantuan dengan pesanan"/></label><label htmlFor="support-details">Rincian masalah<textarea id="support-details" name="details" required maxLength={invoiceNumber ? 2800 : 3000} disabled={busy} value={details} onChange={e=>setDetails(e.target.value)}/></label><button disabled={busy}>{busy?"Membuat tiket...":"Buat tiket CS"}</button></form></DialogContent></Dialog>}
  </>}
 </section>;
}
