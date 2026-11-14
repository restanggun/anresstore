"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import Link from "./domain-link";
import {apiUrl} from "@/lib/auth-api";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
type Room={id:string;subject:string;status:string;created_at:string;rejection_reason?:string};
type Message={id:string;body:string;author_role:string;created_at:string};
const labels:Record<string,string>={new:"Menunggu koneksi CS",in_progress:"Terhubung dengan CS",rejected:"Tiket ditolak",closed:"Selesai"};
export async function supportCall(path:string,method="GET",body?:unknown){
 const res=await fetch(`${apiUrl}/help/conversations${path}`,{method,credentials:"include",cache:"no-store",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.message||"Permintaan gagal. Coba lagi.");return data;
}
export function SupportInbox(){
 const [open,setOpen]=useState(false);
 const [rooms,setRooms]=useState<Room[]>([]),[room,setRoom]=useState<Room|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [subject,setSubject]=useState(""),[details,setDetails]=useState(""),[draft,setDraft]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loggedIn,setLoggedIn]=useState(false),[loading,setLoading]=useState(true);
 const [page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[historyPage,setHistoryPage]=useState(0),[older,setOlder]=useState(false),[refresh,setRefresh]=useState(0);
 const pendingCreate=useRef<{id:string;subject:string;body:string}|null>(null),pendingSend=useRef<{id:string;body:string}|null>(null);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener("support-ticket-created",show);return()=>window.removeEventListener("support-ticket-created",show);},[]);
 useEffect(()=>{let active=true;async function load(){try{const data=await supportCall(`?page=${page}`);if(active){setRooms(data.rows);setHasMore(data.hasMore);setLoggedIn(true);}}catch(e){if(active)setNotice((e as Error).message);}finally{if(active)setLoading(false);}}void load();const timer=setInterval(()=>void load(),5000);const created=(event:Event)=>{const id=(event as CustomEvent<string>).detail;setPage(0);setRefresh(v=>v+1);if(id){void supportCall(`/${id}/messages?page=0`).then(data=>{if(active){setMessages(data.rows);setRoom(data.room);setHistoryPage(0);}}).catch(e=>{if(active)setNotice((e as Error).message);});}};window.addEventListener("support-ticket-created",created);return()=>{active=false;clearInterval(timer);window.removeEventListener("support-ticket-created",created);};},[page,refresh]);
 useEffect(()=>{if(!room)return;let active=true;const id=room.id;async function read(){try{const data=await supportCall(`/${id}/messages?page=${historyPage}`);if(active){setMessages(data.rows);setRoom(data.room);setOlder(data.hasMore);}}catch(e){if(active)setNotice((e as Error).message);}}void read();const timer=setInterval(()=>void read(),5000);return()=>{active=false;clearInterval(timer);};},[room?.id,historyPage]);
 async function create(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setNotice("");const payload=pendingCreate.current?.subject===subject&&pendingCreate.current.body===details?pendingCreate.current:{id:crypto.randomUUID(),subject,body:details};pendingCreate.current=payload;try{await supportCall("","POST",payload);const next={id:payload.id,subject,status:"new",created_at:new Date().toISOString()};setSubject("");setDetails("");setMessages([]);setHistoryPage(0);setRoom(next);setRefresh(v=>v+1);pendingCreate.current=null;}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 async function send(e:FormEvent){e.preventDefault();if(!room||busy)return;setBusy(true);setNotice("");const payload=pendingSend.current?.body===draft?pendingSend.current:{id:crypto.randomUUID(),body:draft};pendingSend.current=payload;try{await supportCall(`/${room.id}/messages`,"POST",payload);setDraft("");pendingSend.current=null;setHistoryPage(0);const data=await supportCall(`/${room.id}/messages?page=0`);setMessages(data.rows);setRoom(data.room);}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 return <section id="support-inbox" className="support-inbox" aria-labelledby="support-inbox-title">
  <h2 id="support-inbox-title">Tiket dan chat CS</h2><p>Buat tiket dan tunggu tim CS menerima permintaanmu. Jangan kirim password atau kode OTP.</p>
  {notice&&<p role="alert">{notice}</p>}{loading?<p role="status">Memuat tiket...</p>:!loggedIn?<Link href="/login">Masuk untuk membuka tiket</Link>:<>
   <div className="support-room-list">{rooms.map(r=><button type="button" key={r.id} aria-pressed={open&&room?.id===r.id} disabled={busy} onClick={()=>{setMessages([]);setRoom(r);setOpen(true);setDraft("");pendingSend.current=null;setHistoryPage(0);setNotice("");}}>{r.subject} · {labels[r.status]}</button>)}</div>
   {!rooms.length&&<p>Belum ada tiket pada halaman ini.</p>}
   <div className="support-room-list"><button type="button" disabled={busy} onClick={()=>{setRoom(null);setOpen(true);setMessages([]);setNotice("");}}>+ Tiket / Room chat</button><button type="button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Tiket sebelumnya</button><button type="button" disabled={!hasMore} onClick={()=>setPage(p=>p+1)}>Tiket berikutnya</button></div>
   <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="support-inbox support-popup"><DialogTitle>{room?"Room chat CS":"Buat tiket CS"}</DialogTitle><DialogDescription>{room?"Percakapan dengan tim customer service.":"Isi kebutuhanmu. Tim CS akan menerima tiket sebelum memulai percakapan."}</DialogDescription>{notice&&<p role="alert">{notice}</p>}
   {room?<div className="support-chat"><h3>{room.subject}</h3><p role="status">{labels[room.status]}{room.status==="new"?". Pesanmu tersimpan dalam antrean. CS akan membalas setelah menerima tiket.":""}</p>{room.rejection_reason&&<p>Alasan: {room.rejection_reason}</p>}
    <div className="support-messages" role="log" aria-label="Percakapan CS">{messages.map(m=><article className={m.author_role} key={m.id}><strong>{m.author_role==="staff"?"Tim CS":m.author_role==="ai"?"Anres AI":"Kamu"}</strong><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString("id-ID")}</small></article>)}</div>
    <div className="support-room-list"><button type="button" disabled={!older} onClick={()=>setHistoryPage(p=>p+1)}>Pesan lebih lama</button><button type="button" disabled={!historyPage} onClick={()=>setHistoryPage(p=>p-1)}>Pesan lebih baru</button></div>
    {!["closed","rejected"].includes(room.status)?<form onSubmit={e=>void send(e)}><label>Pesan<textarea required maxLength={3000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><button disabled={busy||!draft.trim()}>{busy?"Mengirim...":"Kirim pesan"}</button></form>:<p>Buat tiket baru untuk bantuan berikutnya.</p>}
   </div>:<form className="support-create-form" onSubmit={e=>void create(e)}><label>Subjek bantuan<input required minLength={3} maxLength={160} disabled={busy} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Contoh: perlu bantuan dengan pesanan"/></label><label>Rincian masalah<textarea required maxLength={3000} disabled={busy} value={details} onChange={e=>setDetails(e.target.value)}/></label><button disabled={busy}>{busy?"Membuat tiket...":"Buat tiket CS"}</button></form>}
   </DialogContent></Dialog>
  </>}
 </section>;
}
