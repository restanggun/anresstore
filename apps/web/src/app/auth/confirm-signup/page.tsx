"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { authRequest } from "@/lib/auth-api";

export default function ConfirmSignup() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEmail(sessionStorage.getItem("anres_confirm_email") || ""); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setMessageSuccess(false); setBusy(true);
    try { await authRequest("confirm-signup", { email: email.trim(), token: token.trim() }); sessionStorage.removeItem("anres_confirm_email"); window.location.assign("/"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Konfirmasi gagal. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (!email.trim()) { setMessageSuccess(false); setMessage("Isi email terlebih dahulu untuk mengirim ulang kode."); return; }
    setMessage(""); setMessageSuccess(false); setBusy(true);
    try { await authRequest("resend-signup", { email: email.trim() }); setMessageSuccess(true); setMessage("Jika akun masih menunggu konfirmasi, kode baru akan dikirim ke emailmu."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Kode tidak dapat dikirim. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <main id="main" className="container auth-page"><section className="auth-aside"><Link href="/login" className="auth-back"><ArrowLeft size={17}/>Kembali ke login</Link><div><div className="auth-symbol"><LockKeyhole size={42} strokeWidth={1.5}/></div><h1>Selangkah lagi,<br/>akunmu siap.</h1><p>Masukkan kode yang kami kirim ke email untuk mengonfirmasi akunmu.</p></div><span className="auth-aside-note">Anres Store</span></section><section className="auth-form-panel"><div className="auth-form-heading"><h2>Konfirmasi email</h2><p>Periksa kotak masuk atau folder spam, lalu masukkan kode konfirmasi.</p></div><form onSubmit={submit}><div className="form-field"><label htmlFor="confirm-email">Email</label><Input id="confirm-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="form-field"><label htmlFor="confirm-code">Kode konfirmasi</label><Input id="confirm-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ""))} required /></div><Button type="submit" className="auth-submit signup-action" disabled={busy}>{busy ? "Memproses..." : "Konfirmasi email"}<ArrowRight size={17}/></Button></form>{message && <p className={`form-notice${messageSuccess ? " form-notice-success" : ""}`} role={messageSuccess ? "status" : "alert"}>{message}</p>}<button type="button" className="auth-step-back" onClick={resend} disabled={busy}>Kirim ulang kode</button></section></main>;
}
