"use client";
import { CustomSelect } from "./custom-select";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, Eye, EyeOff, ChevronRight } from "lucide-react";
import { AnimatedHeading } from "./animated-heading";

const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
function CodeInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="admin-code-label">Kode enam digit<div className="admin-code-control"><input aria-label="Kode enam digit" required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={disabled} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}/><div className="admin-code-slots" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className={i === value.length ? "active" : ""}>{value[i] || ""}</span>)}</div></div></label>;
}
type Factor = { id: string; name: string };
function GoogleMark() { return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5.1h6.5c3.8-3.5 6.1-8.7 6.1-14.8z"/><path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.9l-6.5-5.1c-1.8 1.2-4.1 2-6.7 2-5.2 0-9.6-3.5-11.2-8.2H6.1v5.3C9.4 39.5 16.2 44 24 44z"/><path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6v-5.3H6.1a20 20 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 12c2.9 0 5.5 1 7.6 3l5.7-5.7C33.9 6 29.4 4 24 4 16.2 4 9.4 8.5 6.1 14.9l6.7 5.3C14.4 15.5 18.8 12 24 12z"/></svg>; }
async function call(path: string, body?: unknown) {
  const response = await fetch(`${api}/${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Permintaan gagal.");
  return data;
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "login" | "mfa" | "ready">("loading");
  const [stage, setStage] = useState<"email" | "options" | "password" | "otp" | "recover">("email");
  const [providers, setProviders] = useState<string[]>([]); const [show, setShow] = useState(false); const [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [factors, setFactors] = useState<Factor[]>([]); const [factor, setFactor] = useState("");
  const [remember, setRemember] = useState(true);
  const [qrCode, setQrCode] = useState("");
  const [enrollmentAllowed, setEnrollmentAllowed] = useState(false); const [secret, setSecret] = useState("");
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (state !== "login" || !process.env.NEXT_PUBLIC_AUTH_URL) return;
    let active = true;
    void call("auth/session").then(data => {
      if (active && !data.user) window.location.replace(`${process.env.NEXT_PUBLIC_AUTH_URL}/login?app=admin`);
    }).catch(() => {});
    return () => { active = false; };
  }, [state]);
  async function inspect(afterLogin = false) {
    try { await call("admin/session"); setState("ready"); }
    catch {
      try {
        await call("admin/eligibility");
        const data=await call("admin/mfa");
        setFactors(Array.isArray(data.factors)?data.factors:[]);
        setFactor(Array.isArray(data.factors)&&data.factors.length?data.factors[0].id:"");
        setEnrollmentAllowed(data.enrollmentAllowed===true);
        setState("mfa");
      } catch { setState("login"); if (afterLogin) setMessage("Akun belum memiliki akses admin atau layanan autentikasi sedang tidak tersedia."); }
    }
  }
  useEffect(() => { if (new URLSearchParams(window.location.search).has("auth_error")) setMessage("Autentikasi gagal atau tautan kedaluwarsa. Silakan coba lagi."); void inspect(); }, []);
  async function continueEmail(event: FormEvent) {
    event.preventDefault(); const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setMessage("Masukkan alamat email yang valid."); return; }
    setEmail(value); setBusy(true); setMessage(""); setNotice("");
    try { const data = await call("auth/check-email", { email: value }); if (!data.exists || !data.confirmed) { setMessage("Gunakan akun yang sudah terdaftar dan terkonfirmasi."); return; } setProviders(Array.isArray(data.providers) ? data.providers : []); setStage("options"); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function sendCode() { setBusy(true); setMessage(""); setNotice(""); try { await call("auth/send-login-code", { email }); setStage("otp"); setNotice("Kode login dikirim. Periksa email kamu."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function verifyEmail(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await call("auth/verify-login-code", { email, token: code }); setCode(""); setNotice(""); await inspect(true); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function recover() { setBusy(true); setMessage(""); try { await call("auth/recover", { email }); setNotice("Instruksi pemulihan dikirim. Periksa email kamu."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await call("auth/login", { email, password }); setPassword(""); await inspect(true); }
    catch { setMessage("Login gagal. Periksa email dan password, lalu coba lagi."); }
    finally { setBusy(false); }
  }
  async function enroll() {
    setBusy(true); setMessage("");
    try { const result = await call("admin/mfa/enroll", {}); setFactor(result.id); setSecret(result.secret); setQrCode(result.qrCode); setCode(""); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const challenge = await call("admin/mfa/challenge", { factorId: factor }); await call("admin/mfa/verify", { factorId: factor, challengeId: challenge.id, code, remember }); setCode(""); setSecret(""); setQrCode(""); await call("admin/session"); setState("ready"); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  if (state === "ready") return <>{children}</>;
  const heading = state === "mfa" ? (factors.length ? "Verifikasi akunmu" : "Siapkan autentikator") : stage === "email" ? "Selamat datang" : stage === "options" ? "Pilih cara masuk" : stage === "password" ? "Masukkan password" : stage === "otp" ? "Masukkan kode login" : "Atur ulang password";
  const google = () => { window.location.assign(`${api}/auth/google?app=admin`); };
  const changeStage = (next: typeof stage) => { setMessage(""); setNotice(""); setStage(next); };
  if (state === "login" && process.env.NEXT_PUBLIC_AUTH_URL) return <main id="main" className="admin-login"><section className="admin-login-panel"><div className="admin-auth-panel-inner"><h1>Akses admin</h1><p>Masuk menggunakan akun yang memiliki izin admin. Jika sudah masuk, periksa izin akun atau ketersediaan layanan.</p><a href={`${process.env.NEXT_PUBLIC_AUTH_URL}/login?app=admin`}>Masuk atau ganti akun</a></div></section></main>;
  return <main id="main" className="admin-login"><div className="admin-auth-layout">
    <section className="admin-auth-aside"><a className="admin-auth-back" href={(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "")}><ArrowLeft size={17}/>Kembali ke website</a><div className="admin-auth-intro"><span className="admin-auth-symbol"><LockKeyhole size={42} strokeWidth={1.5}/></span><h1><AnimatedHeading text="Semua kebutuhan,"/><br/><AnimatedHeading text="satu akun."/></h1><p>Untuk waktu bermain, ide baru, dan hal-hal kecil yang menemani harimu.</p></div><span className="admin-auth-note">Anres Store</span></section>
    <section className="admin-login-panel" aria-labelledby="admin-auth-title"><div className="admin-auth-panel-inner"><h2 id="admin-auth-title">{heading}</h2><p className="admin-auth-description">{state === "mfa" ? "Satu langkah lagi untuk masuk ke ruang kerja." : stage === "email" ? "Masuk atau buat akun untuk melanjutkan." : "Selamat datang kembali."}</p>
    {state === "login" && stage !== "email" && <div className="admin-email-summary"><span><Mail size={16}/><strong>{email}</strong></span><button type="button" onClick={() => changeStage("email")}>Ubah</button></div>}
    <AnimatePresence mode="wait" initial={false}><motion.div key={state === "login" ? stage : state} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: reducedMotion ? 0 : .18 }}>
    {state === "loading" && <p role="status" className="admin-auth-loading">Memeriksa sesi...</p>}
    {state === "login" && stage === "email" && <><form onSubmit={continueEmail} className="admin-login-form"><label>Email<input required type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={e => { setEmail(e.target.value); setMessage(""); }} /></label>{message && <p className="admin-auth-error" role="alert">{message}</p>}<button className="ops-button admin-auth-submit" disabled={busy}>{busy ? "Memeriksa..." : "Lanjutkan"}<ArrowRight size={17}/></button></form><div className="admin-auth-divider"><span/>atau<span/></div><button className="admin-auth-google" type="button" onClick={google} disabled={busy}><GoogleMark/>Lanjutkan dengan Google</button></>}
    {state === "login" && stage === "options" && <div className="admin-auth-options">{providers.includes("email") && <button onClick={() => changeStage("password")}><span>Masuk dengan password</span><ChevronRight size={17}/></button>}<button onClick={() => void sendCode()} disabled={busy}><span>Masuk dengan kode email</span><ChevronRight size={17}/></button>{providers.includes("google") && <button onClick={google}><GoogleMark/><span>Masuk dengan Google</span><ChevronRight size={17}/></button>}{message && <p className="admin-auth-error" role="alert">{message}</p>}</div>}
    {state === "login" && stage === "password" && <form onSubmit={login} className="admin-login-form"><input type="hidden" name="username" autoComplete="username" value={email}/><label>Password<span className="admin-password-wrap"><input required name="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan password" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={show ? "Sembunyikan password" : "Lihat password"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span></label>{message && <p className="admin-auth-error" role="alert">{message}</p>}<button type="button" className="admin-auth-reset" onClick={() => changeStage("recover")}>Lupa password?</button><button className="ops-button admin-auth-submit" disabled={busy}>{busy ? "Memeriksa..." : "Masuk"}<ArrowRight size={17}/></button></form>}
    {state === "login" && stage === "otp" && <form onSubmit={verifyEmail} className="admin-login-form"><p>Masukkan kode yang dikirim ke emailmu.</p><CodeInput value={code} onChange={setCode} disabled={busy}/>{message && <p className="admin-auth-error" role="alert">{message}</p>}<button className="ops-button admin-auth-submit" disabled={busy}>Masuk<ArrowRight size={17}/></button><button type="button" className="admin-auth-link" onClick={() => void sendCode()} disabled={busy}>Kirim ulang kode</button></form>}
    {state === "login" && stage === "recover" && <div className="admin-login-form"><p>Kami akan menggunakan alamat email di atas untuk pemulihan akun.</p>{message && <p className="admin-auth-error" role="alert">{message}</p>}<button type="button" className="ops-button admin-auth-submit" onClick={() => void recover()} disabled={busy}>Kirim instruksi<ArrowRight size={17}/></button>{notice && <a className="admin-auth-link" href={`${(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "")}/auth/reset-password`}>Buka halaman atur ulang password</a>}</div>}
    {state === "mfa" && <div className="admin-login-form admin-mfa">
      <p>{factors.length ? "Masukkan kode enam digit dari aplikasi autentikator kamu." : "Hubungkan aplikasi autentikator untuk melindungi akses ruang admin."}</p>
      {factors.length > 1 && <label>Autentikator<CustomSelect value={factor} onChange={e => { setFactor(e.target.value); setCode(""); setMessage(""); }}>{factors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</CustomSelect></label>}
      {!factors.length && !secret && (enrollmentAllowed ? <button type="button" className="ops-button admin-auth-submit" disabled={busy} onClick={() => void enroll()}>{busy ? "Menyiapkan..." : "Siapkan autentikator"}<ArrowRight size={17}/></button> : <div className="admin-mfa-unavailable"><p>Pendaftaran autentikator belum diaktifkan untuk akun ini. Jika akses baru saja diberikan, periksa kembali.</p><button type="button" className="admin-auth-link" disabled={busy} onClick={async () => { setBusy(true); await inspect(); setBusy(false); }}>Periksa akses lagi</button></div>)}
      {secret && <div className="admin-mfa-setup"><p>Buka aplikasi autentikator, pilih tambah akun, lalu pindai QR ini.</p>{qrCode && <div className="admin-mfa-qr"><img src={qrCode} width={208} height={208} alt="QR untuk menambahkan autentikator Anres Store"/></div>}<details><summary>Tidak bisa memindai QR?</summary><p>Tambahkan akun dengan kunci penyiapan berikut.</p><code className="admin-mfa-secret">{secret}</code></details></div>}
      {factor && <form className="admin-login-form" onSubmit={verify}><CodeInput value={code} onChange={setCode} disabled={busy}/><label className="admin-session-choice"><input type="checkbox" checked={remember} disabled={busy} onChange={e=>setRemember(e.target.checked)}/><span>Simpan sesi di perangkat ini<small>Login dan verifikasi MFA tetap tersimpan saat browser dibuka kembali.</small></span></label>{message && <p className="admin-auth-error" role="alert">{message}</p>}<button className="ops-button admin-auth-submit" disabled={busy || code.length !== 6}>{busy ? "Memeriksa..." : secret ? "Aktifkan autentikator" : "Verifikasi"}<ArrowRight size={17}/></button></form>}
      {message && !factor && <p className="admin-auth-error" role="alert">{message}</p>}
      <button type="button" className="admin-auth-link" disabled={busy} onClick={() => { setSecret(""); setQrCode(""); setCode(""); setMessage(""); setState("login"); setStage("email"); if (process.env.NEXT_PUBLIC_AUTH_URL) window.location.assign(`${process.env.NEXT_PUBLIC_AUTH_URL}/login?app=admin`); }}>Gunakan akun lain</button>
    </div>}
    </motion.div></AnimatePresence>{notice && <p className="admin-auth-notice" role="status">{notice}</p>}<div className="admin-auth-footer">{state === "login" && stage !== "email" && <button className="admin-auth-link" onClick={() => changeStage("email")}><ArrowLeft size={15}/>Kembali</button>}{state === "login" && <><p>Belum punya akun? <a href={`${(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "")}/daftar`}>Daftar</a></p><a href={`${(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/$/, "")}/bantuan`}>Butuh bantuan tentang akun?</a></>}<p>Ruang admin hanya untuk akun yang telah diberikan akses.</p></div></div></section>
  </div></main>;
}
