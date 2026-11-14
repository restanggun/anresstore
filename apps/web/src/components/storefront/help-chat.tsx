"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, Sparkles } from "lucide-react";
import { apiUrl } from "@/lib/auth-api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./help-chat.css";

type Message = {id:string;role:"user"|"assistant";content:string};
type Session = {id:string;subject:string;ticket_id:string|null;messages:Message[]};
type SessionSummary = Omit<Session,"messages">;
const suggestions = ["Bagaimana cara memilih produk?", "Apakah pembayaran sudah tersedia?", "Bagaimana cara membuat akun?"];
async function sessionCall<T>(path:string,method="GET",body?:unknown):Promise<T> {
 const response=await fetch(`${apiUrl}/help/ai-sessions${path}`,{method,credentials:"include",cache:"no-store",signal:AbortSignal.timeout(65000),headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>null);
 if(!response.ok) throw new Error(data?.message || "Percakapan belum dapat dimuat. Coba lagi.");
 return data as T;
}
export function HelpChat({ query, request }: { query: string; request: { id: number; text: string } | null }) {
 const [session,setSession]=useState<Session|null>(null),[sessions,setSessions]=useState<SessionSummary[]>([]);
 const [input,setInput]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [page,setPage]=useState(0),[hasMore,setHasMore]=useState(false);
 const lock=useRef(false),createId=useRef<string|null>(null),pending=useRef<{sessionId:string;id:string;content:string}|null>(null);
 const handledRequest=useRef<number|null>(null),messagesRef=useRef<HTMLDivElement>(null);
 const messages=session?.messages || [],support=!!session?.ticket_id;
 useEffect(()=>{if(!session?.messages.length)setInput(query);},[query]);
 useEffect(()=>{const panel=messagesRef.current;if(panel)panel.scrollTop=panel.scrollHeight;},[session,busy]);
 useEffect(()=>{
  let active=true;
  void sessionCall<{rows:SessionSummary[];hasMore:boolean}>("?page=0").then(async data=>{
   if(!active)return;
   setSessions(data.rows);setHasMore(data.hasMore);
   if(data.rows[0]) {const room=await sessionCall<Session>(`/${data.rows[0].id}`);if(active)setSession(room);}
  }).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 async function refreshList(index=page) {
  const data=await sessionCall<{rows:SessionSummary[];hasMore:boolean}>(`?page=${index}`);
  setSessions(data.rows);setHasMore(data.hasMore);setPage(index);
 }
 async function ensureSession() {
  if(session)return session;
  createId.current ||= crypto.randomUUID();
  const room=await sessionCall<Session>("","POST",{id:createId.current});
  setSession(room);createId.current=null;return room;
 }
 async function selectSession(id:string) {
  if(lock.current || loading)return;
  lock.current=true;setBusy(true);setError("");
  try {const room=await sessionCall<Session>(`/${id}`);setSession(room);setInput("");pending.current=null;}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 async function changePage(index:number) {
  if(lock.current || loading)return;
  lock.current=true;setBusy(true);setError("");
  try{await refreshList(index);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 function newSession() {
  if(lock.current || loading)return;
  setSession(null);setInput("");setError("");pending.current=null;createId.current=null;
 }
 function openTicket(id:string) {window.dispatchEvent(new CustomEvent("support-ticket-created",{detail:id}));}
 async function convert(room:Session) {
  const saved=await sessionCall<Session>(`/${room.id}/convert`,"POST");
  setSession(saved);if(saved.ticket_id)openTicket(saved.ticket_id);
 }
 async function switchToCS() {
  if(lock.current || loading)return;
  if(session?.ticket_id){openTicket(session.ticket_id);return;}
  lock.current=true;setBusy(true);setError("");
  try{await convert(await ensureSession());await refreshList(0);}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 async function send(text:string) {
  const content=text.trim();if(!content || lock.current || loading || support)return;
  lock.current=true;setBusy(true);setError("");setInput("");
  let saved=false;
  try {
   const room=await ensureSession();
   const message=pending.current?.sessionId===room.id && pending.current.content===content ? pending.current : {sessionId:room.id,id:crypto.randomUUID(),content};
   pending.current=message;
   const next=await sessionCall<Session>(`/${room.id}/messages`,"POST",{id:message.id,content});
   setSession(next);pending.current=null;saved=true;
   if(/(?:hubung|bicara|ngobrol|sambung|alih|switch|buat).*(?:cs|manusia|human|admin|tiket|ticket)|(?:mau|ingin|minta) (?:cs|tiket)/i.test(content))await convert(next);
   await refreshList(0);
  } catch(e){if(!saved)setInput(content);setError((e as Error).message);}
  finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{
  if(!request || loading || busy || handledRequest.current===request.id)return;
  handledRequest.current=request.id;void send(request.text);
 },[request,loading,busy]);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void send(input);}
 return <section className="help-chat" aria-labelledby="help-chat-title">
  <div className="help-chat-intro"><span className="help-chat-icon"><MessageCircle size={25} aria-hidden="true"/></span><div><span className="help-chat-label"><Sparkles size={14} aria-hidden="true"/> Asisten AI</span><h2 id="help-chat-title">Butuh bantuan lebih lanjut?</h2><p>Lanjutkan percakapan sebelumnya atau mulai sesi baru. Riwayat sesi ikut dikirim saat kamu mengalihkannya ke CS.</p></div></div>
  <div className="help-chat-panel" aria-busy={loading || busy}>
   <div className="help-chat-session-controls"><label htmlFor="help-chat-session">Riwayat percakapan<select id="help-chat-session" value={sessions.some(s=>s.id===session?.id)?session!.id:""} disabled={loading || busy} onChange={e=>{if(e.target.value)void selectSession(e.target.value);}}><option value="">{session?session.subject:"Percakapan baru"}</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.subject}{s.ticket_id?" · Tiket CS":""}</option>)}</select></label><button type="button" disabled={loading || busy} onClick={newSession}>+ Sesi baru</button></div>
   {(page>0 || hasMore)&&<div className="help-chat-suggestions"><button type="button" disabled={loading || busy || !page} onClick={()=>void changePage(page-1)}>Riwayat lebih baru</button><button type="button" disabled={loading || busy || !hasMore} onClick={()=>void changePage(page+1)}>Riwayat lebih lama</button></div>}
   <div ref={messagesRef} className="help-chat-messages" aria-live="polite" aria-relevant="additions text">
    {loading?<p role="status">Memuat riwayat percakapan...</p>:<div className="help-chat-message assistant"><span>Anres AI</span><p>Halo! Aku siap membantu menjawab pertanyaanmu tentang Anres Store.</p></div>}
    {messages.map(message=><div key={message.id} className={`help-chat-message ${message.role}`}><span>{message.role==="user"?"Kamu":"Anres AI"}</span>{message.role==="assistant"?<div className="help-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{message.content}</ReactMarkdown></div>:<p>{message.content}</p>}</div>)}
    {busy&&<p className="help-chat-wait">Sedang menyiapkan percakapan...</p>}
   </div>
   {!loading && !messages.length && !support&&<div className="help-chat-suggestions" aria-label="Contoh pertanyaan">{suggestions.map(suggestion=><button key={suggestion} type="button" disabled={busy} onClick={()=>void send(suggestion)}>{suggestion}</button>)}</div>}
   {error&&<p className="help-chat-error" role="alert">{error}</p>}
   <form className="help-chat-form" onSubmit={submit}><label htmlFor="help-chat-input" className="sr-only">Pertanyaan untuk asisten</label><input id="help-chat-input" value={input} onChange={event=>setInput(event.target.value)} placeholder="Tulis pertanyaanmu..." maxLength={1500} disabled={loading || busy || support}/><button type="submit" disabled={loading || busy || support || !input.trim()} aria-label="Kirim pertanyaan"><ArrowUp size={19} aria-hidden="true"/></button></form>
   <p className="help-chat-note">Riwayat disimpan per sesi. Sesi tamu tersedia di browser ini; sesi akun tersimpan di akunmu. AI menggunakan konteks pesan terbaru dalam sesi yang sama. Pesan dikirim ke layanan AI pihak ketiga. Jangan kirim password, kode OTP, atau data sensitif.</p>
   <button className="help-contact-button" type="button" disabled={loading || busy} onClick={()=>void switchToCS()}>{support?"Buka tiket dan chat CS":"Alihkan sesi ke CS / Buat tiket"}</button>
   {support&&<p role="status">Sesi sudah menjadi tiket CS. Seluruh riwayat tersimpan. Balasan CS dilanjutkan melalui tiket.</p>}
  </div>
 </section>;
}
