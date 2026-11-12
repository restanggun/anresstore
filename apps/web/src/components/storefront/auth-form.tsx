"use client";
import Link from "next/link";
import { apiUrl, authRequest } from "@/lib/auth-api";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";

type Mode = "login" | "register" | "recover";
type Stage = "email" | "password" | "register" | "recover";

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5.1h6.5c3.8-3.5 6.1-8.7 6.1-14.8z"/><path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.9l-6.5-5.1c-1.8 1.2-4.1 2-6.7 2-5.2 0-9.6-3.5-11.2-8.2H6.1v5.3C9.4 39.5 16.2 44 24 44z"/><path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6v-5.3H6.1a20 20 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 12c2.9 0 5.5 1 7.6 3l5.7-5.7C33.9 6 29.4 4 24 4 16.2 4 9.4 8.5 6.1 14.9l6.7 5.3C14.4 15.5 18.8 12 24 12z"/></svg>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => { if (new URLSearchParams(window.location.search).has("auth_error")) setError("Autentikasi gagal atau tautan kedaluwarsa. Silakan coba lagi."); }, []);
  const heading: Record<Stage, string> = {
    email: mode === "recover" ? "Atur ulang password" : "Selamat datang",
    password: "Masukkan password",
    register: "Buat akunmu",
    recover: "Atur ulang password",
  };
  function changeStage(next: Stage) { setError(""); setNotice(""); setStage(next); }
  async function continueEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setError("Masukkan alamat email yang valid."); return; }
    setEmail(value); setError(""); setNotice("");
    if (mode === "recover") { changeStage("recover"); return; }
    setBusy(true);
    try {
      changeStage(mode === "register" ? "register" : "password");
    } finally { setBusy(false); }
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? "");
    if (stage === "register" && (String(form.get("name") ?? "").trim().length < 2 || password.length < 8 || password !== String(form.get("confirmation") ?? ""))) { setError("Periksa nama, password minimal 8 karakter, dan konfirmasi password."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (stage === "register") { const data = await authRequest<{authenticated:boolean}>("register",{email,password,name:String(form.get("name")).trim()}); if (data.authenticated) { window.location.assign("/"); } else setNotice("Periksa email untuk mengonfirmasi akunmu."); }
      else if (stage === "password") { await authRequest("login",{email,password}); window.location.assign("/"); }
    } catch (err) { setError(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi."); } finally { setBusy(false); }
  }
  async function recover() { setBusy(true); setError(""); try { await authRequest("recover",{email}); setNotice("Jika akun tersedia, instruksi pemulihan akan dikirim ke emailmu."); } catch(err) { setError(err instanceof Error ? err.message : "Permintaan gagal."); } finally { setBusy(false); } }
  function google() { window.location.assign(`${apiUrl}/auth/google`); }
  const field = (id: string, label: string, type: string, placeholder: string, auto: string) =>
    <div className="form-field"><label htmlFor={id}>{label}</label><div className="auth-input-wrap"><Input id={id} name={id} type={type === "password" && show ? "text" : type} placeholder={placeholder} autoComplete={auto} required />{id === "password" && <button type="button" className="password-toggle" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan password" : "Lihat password"} aria-pressed={show}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button>}</div></div>;
  return <main id="main" className="container auth-page">
    <section className="auth-aside"><Link href="/katalog" className="auth-back"><ArrowLeft size={17}/>Kembali ke katalog</Link><div><div className="auth-symbol"><LockKeyhole size={42} strokeWidth={1.5}/></div><h1><TextGenerateEffect as="span" words="Semua kebutuhan," className="auth-headline-line" duration={.3}/><TextGenerateEffect as="span" words="satu akun." className="auth-headline-line" duration={.3} delay={.12}/></h1><p>Untuk waktu bermain, ide baru, dan hal-hal kecil yang menemani harimu.</p></div><span className="auth-aside-note">Anres Store</span></section>
    <section className="auth-form-panel" aria-labelledby="auth-title">
      <div className="auth-form-heading"><h2 id="auth-title">{heading[stage]}</h2><p>{stage === "email" ? mode === "recover" ? "Mulai dengan email akunmu." : "Masuk atau buat akun untuk melanjutkan." : stage === "register" ? "Sedikit lagi untuk membuat akun." : stage === "recover" ? "Instruksi pemulihan akan dikirim ke emailmu." : "Selamat datang kembali."}</p></div>
      {stage !== "email" && <div className="auth-email-summary"><span><Mail size={16}/><strong>{email}</strong></span><button type="button" onClick={() => changeStage("email")}>Ubah</button></div>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={stage} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduce ? {opacity:0} : {opacity:0,y:-6}} transition={{duration:reduce?0:.18}}>
        {stage === "email" && <><form noValidate onSubmit={continueEmail}><div className="form-field"><label htmlFor="auth-email">Email</label><Input id="auth-email" type="email" name="email" value={email} onChange={event => {setEmail(event.target.value);setError("");setNotice("");}} autoComplete="email" placeholder="nama@email.com" required aria-invalid={!!error} aria-describedby={error?"auth-error":undefined}/></div>{error && <p id="auth-error" className="field-error" role="alert">{error}</p>}<Button type="submit" className="auth-submit signup-action" disabled={busy}>{busy?"Memeriksa...":"Lanjutkan"}<ArrowRight size={17}/></Button></form>{mode !== "recover" && <><div className="auth-divider"><span/>atau<span/></div><button type="button" className="auth-google" onClick={google} disabled={busy}><GoogleMark/>Lanjutkan dengan Google</button></>}</>}
        {(stage === "password" || stage === "register") && <form noValidate onSubmit={submitAuth} onInput={() => {setError("");setNotice("");}}>
          {stage === "register" && field("name","Nama","text","Nama kamu","name")}
          {(stage === "password" || stage === "register") && field("password","Password","password",stage === "register" ? "Minimal 8 karakter" : "Masukkan password",stage === "register" ? "new-password" : "current-password")}
          {stage === "register" && field("confirmation","Ulangi password","password","Ketik ulang password","new-password")}
          {error && <p className="field-error" role="alert">{error}</p>}
          {stage === "password" && <button type="button" className="auth-reset-link" onClick={() => changeStage("recover")}>Lupa password?</button>}
          <Button type="submit" className="auth-submit signup-action" disabled={busy}>{stage === "register" ? "Buat akun" : "Masuk"}<ArrowRight size={17}/></Button>
        </form>}
        {stage === "recover" && <>{error && <p className="field-error" role="alert">{error}</p>}<p className="auth-otp-note">Kami akan menggunakan alamat email di atas untuk pemulihan akun.</p><Button type="button" className="auth-submit signup-action" onClick={recover} disabled={busy}>Kirim instruksi<ArrowRight size={17}/></Button></>}
      </motion.div></AnimatePresence>
      {notice && <div className="form-notice" role="status">{notice}</div>}
      {stage !== "email" && <button type="button" className="auth-step-back" onClick={() => changeStage("email")}><ArrowLeft size={15}/>Kembali</button>}
      {mode !== "recover" && <p className="auth-help">{mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}<Link href={mode === "login" ? "/daftar" : "/login"}>{mode === "login" ? "Daftar" : "Masuk"}</Link></p>}
      <Link href="/bantuan" className="auth-help">Butuh bantuan tentang akun?</Link>
    </section>
  </main>;
}

