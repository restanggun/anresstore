"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { authRequest } from "@/lib/auth-api";

export default function ResetPassword() {
  const [email,setEmail]=useState("");
  const [code,setCode]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [message,setMessage]=useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  useEffect(() => { setEmail(sessionStorage.getItem("anres_recovery_email") || ""); }, []);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(password.length<8 || password!==confirmation) {setMessageSuccess(false); setMessage("Password minimal 8 karakter dan konfirmasinya harus sama.");return;}
    setBusy(true); setMessage(""); setMessageSuccess(false);
    try { await authRequest("reset-password",{email:email.trim(),token:code,password}); sessionStorage.removeItem("anres_recovery_email"); setPassword(""); setConfirmation(""); setCode(""); setDone(true); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Password gagal diperbarui."); }
    finally { setBusy(false); }
  }
  async function resend() {
    if(!email.trim()) {setMessageSuccess(false); setMessage("Isi email akunmu terlebih dahulu.");return;}
    setBusy(true); setMessage(""); setMessageSuccess(false);
    try { await authRequest("recover",{email:email.trim()}); setMessageSuccess(true); setMessage("Jika akun tersedia, kode pemulihan akan dikirim ke emailmu."); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Kode gagal dikirim."); }
    finally {setBusy(false);}
  }
  return <main id="main" className="container auth-page"><section className="auth-aside"><Link href="/login" className="auth-back"><ArrowLeft size={17}/>Kembali ke login</Link><div><div className="auth-symbol"><LockKeyhole size={42} strokeWidth={1.5}/></div><h1>Atur ulang<br/>passwordmu.</h1><p>Gunakan kode yang dikirim ke email untuk membuat password baru.</p></div><span className="auth-aside-note">Anres Store</span></section><section className="auth-form-panel"><div className="auth-form-heading"><h2>{done ? "Password diperbarui" : "Atur password baru"}</h2><p>{done ? "Password baru sudah siap digunakan." : "Masukkan email, kode pemulihan, dan password baru."}</p></div>{done ? <Button asChild className="auth-submit signup-action"><Link href="/login">Kembali ke login<ArrowRight size={17}/></Link></Button> : <><form onSubmit={submit}><div className="form-field"><label htmlFor="recovery-email">Email</label><Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required /></div><div className="form-field"><label htmlFor="recovery-code">Kode pemulihan</label><Input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} required /></div><div className="form-field"><label htmlFor="new-password">Password baru</label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={256} value={password} onChange={event=>setPassword(event.target.value)} required /></div><div className="form-field"><label htmlFor="confirm-password">Ulangi password</label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={256} value={confirmation} onChange={event=>setConfirmation(event.target.value)} required /></div><Button className="auth-submit signup-action" disabled={busy} type="submit">{busy ? "Memproses..." : "Simpan password"}<ArrowRight size={17}/></Button></form>{message && <p className={`form-notice${messageSuccess ? " form-notice-success" : ""}`} role={messageSuccess ? "status" : "alert"}>{message}</p>}<button type="button" className="auth-step-back" onClick={resend} disabled={busy}>Kirim ulang kode</button></>}</section></main>;
}
