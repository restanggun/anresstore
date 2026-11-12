"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, Sparkles } from "lucide-react";
import { apiUrl } from "@/lib/auth-api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./help-chat.css";
import { SupportRequest } from "./support-request";

type Message = {role:"user"|"assistant";content:string};
const suggestions = ["Bagaimana cara memilih produk?", "Apakah pembayaran sudah tersedia?", "Bagaimana cara membuat akun?"];
export function HelpChat({ query, request }: { query: string; request: { id: number; text: string } | null }) {
 const [messages,setMessages]=useState<Message[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [support,setSupport]=useState(false);
 const handledRequest=useRef<number | null>(null);
 const messagesRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{ if (messages.length === 0 && !busy) setInput(query); },[query]);
 useEffect(()=>{ const panel=messagesRef.current; if (panel) panel.scrollTop=panel.scrollHeight; },[messages,busy]);
 async function send(text:string) {
  const content=text.trim();
  if (!content || busy) return;
  const next:Message[]=[...messages,{role:"user",content}];
  setMessages(next); setInput(""); setBusy(true); setError("");
  try {
   const response=await fetch(`${apiUrl}/help/chat`,{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:next.slice(-12)})});
   const data=await response.json().catch(()=>({})) as {answer?:unknown;message?:unknown};
   if (!response.ok || typeof data.answer !== "string") throw new Error(typeof data.message === "string" ? data.message : "Asisten belum bisa menjawab. Coba lagi.");
   setMessages([...next,{role:"assistant",content:data.answer}]);
  } catch (err) { setMessages(messages); setInput(content); setError(err instanceof Error ? err.message : "Asisten belum bisa dihubungi. Coba lagi."); }
  finally { setBusy(false); }
 }
 useEffect(()=>{
  if (!request || busy || handledRequest.current === request.id) return;
  handledRequest.current=request.id;
  void send(request.text);
 },[request,busy]);
 function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); void send(input); }
 return <><section className="help-chat" aria-labelledby="help-chat-title">
  <div className="help-chat-intro"><span className="help-chat-icon"><MessageCircle size={25} aria-hidden="true"/></span><div><span className="help-chat-label"><Sparkles size={14} aria-hidden="true"/> Asisten AI</span><h2 id="help-chat-title">Belum menemukan jawaban?</h2><p>Pertanyaanmu belum ada di jawaban cepat. Kirim ke asisten untuk bantuan lebih lanjut.</p></div></div>
  <div className="help-chat-panel">
   <div ref={messagesRef} className="help-chat-messages" aria-live="polite" aria-relevant="additions text">
    <div className="help-chat-message assistant"><span>Anres AI</span><p>Halo! Aku siap membantu menjawab pertanyaanmu tentang Anres Store.</p></div>
    {messages.map((message,index)=><div key={index} className={`help-chat-message ${message.role}`}><span>{message.role === "user" ? "Kamu" : "Anres AI"}</span>{message.role === "assistant" ? <div className="help-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img:()=>null}}>{message.content}</ReactMarkdown></div> : <p>{message.content}</p>}</div>)}
    {busy && <p className="help-chat-wait">Sedang menyiapkan jawaban...</p>}
   </div>
   {messages.length === 0 && <div className="help-chat-suggestions" aria-label="Contoh pertanyaan">{suggestions.map(suggestion=><button key={suggestion} type="button" disabled={busy} onClick={()=>void send(suggestion)}>{suggestion}</button>)}</div>}
   {error && <p className="help-chat-error" role="alert">{error}</p>}
   <form className="help-chat-form" onSubmit={submit}><label htmlFor="help-chat-input" className="sr-only">Pertanyaan untuk asisten</label><input id="help-chat-input" value={input} onChange={event=>setInput(event.target.value)} placeholder="Tulis pertanyaanmu..." maxLength={1500} disabled={busy}/><button type="submit" disabled={busy || !input.trim()} aria-label="Kirim pertanyaan"><ArrowUp size={19} aria-hidden="true"/></button></form>
   <p className="help-chat-note">Pesan dikirim ke layanan AI pihak ketiga. Jawaban bisa keliru; jangan kirim password, kode OTP, atau data sensitif.</p>
   {(messages.some(message=>message.role === "assistant") || error) && !support && <button className="help-contact-button" type="button" onClick={()=>setSupport(true)}>Masih butuh bantuan? Hubungi CS</button>}
  </div>
 </section>{support && <SupportRequest/>}</>;
}
