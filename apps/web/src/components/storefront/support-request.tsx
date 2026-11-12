"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/auth-api";
import "./help-chat.css";

export function SupportRequest() {
 const [open,setOpen]=useState(false);
 const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [reference,setReference]=useState("");
 const pending=useRef<{id:string;payload:string}|null>(null);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (busy) return;
  const payload=JSON.stringify({name:name.trim(),email:email.trim(),message:message.trim()});
  if (!pending.current || pending.current.payload !== payload) pending.current={id:crypto.randomUUID(),payload};
  const id=pending.current.id; setBusy(true); setError("");
  try {
   const response=await fetch(`${apiUrl}/help/requests`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...JSON.parse(payload)})});
   const data=await response.json().catch(()=>({})) as {message?:unknown};
   if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Permintaan belum dapat disimpan.");
   setReference(id); setName(""); setEmail(""); setMessage(""); pending.current=null;
  } catch(err) { setError(err instanceof Error ? err.message : "Permintaan belum dapat disimpan. Coba lagi."); }
  finally { setBusy(false); }
 }
 return <section className="support-request" aria-labelledby="support-request-title">
  <div className="support-request-heading"><span className="help-chat-icon"><LifeBuoy size={25} aria-hidden="true"/></span><div><h2 id="support-request-title">Masih butuh bantuan CS?</h2><p>Simpan pertanyaan untuk tim Anres. Sistem admin dan balasan CS masih disiapkan, jadi belum ada waktu respons yang dapat dijanjikan.</p></div></div>
  {!open && !reference && <Button variant="outline" onClick={()=>setOpen(true)}>Tulis permintaan bantuan <ArrowRight size={16}/></Button>}
  {reference && <div className="support-request-success" role="status"><strong>Permintaan berhasil disimpan.</strong><p>Nomor referensi: {reference}</p><p>Sistem balasan CS masih disiapkan.</p><button type="button" onClick={()=>{setReference("");setOpen(true);}}>Tulis permintaan lain</button></div>}
  {open && !reference && <form className="support-request-form" onSubmit={submit}>
   <div className="support-request-fields"><div className="form-field"><label htmlFor="support-name">Nama</label><Input id="support-name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={100} required disabled={busy}/></div><div className="form-field"><label htmlFor="support-email">Email untuk dihubungi</label><Input id="support-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254} required disabled={busy}/></div></div>
   <div className="form-field"><label htmlFor="support-message">Ceritakan kendalamu</label><textarea id="support-message" value={message} onChange={e=>setMessage(e.target.value)} minLength={10} maxLength={3000} required disabled={busy} rows={5} placeholder="Ceritakan apa yang ingin kamu tanyakan."/></div>
   <p className="help-chat-note">Jangan sertakan password, kode OTP, atau data sensitif. Permintaan ini disimpan untuk tim Anres.</p>
   {error && <p className="help-chat-error" role="alert">{error}</p>}
   <div className="support-request-actions"><Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan permintaan"} <ArrowRight size={16}/></Button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Batal</button></div>
  </form>}
 </section>;
}
