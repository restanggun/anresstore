"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authRequest } from "@/lib/auth-api";
import { Button } from "@anres/ui";
import { Input } from "@/components/ui/input";

type User = { email: string; name: string };
type Profile = { user: User; fullName: string };
export function AccountPage({ profile = false }: { profile?: boolean }) {
  const [data, setData] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { authRequest<Profile>("profile").then(value => { setData(value); setName(value.fullName); }).catch(error => { if (error instanceof Error && error.message === "Silakan masuk kembali.") window.location.replace("/login"); else setMessage("Profil tidak dapat dimuat. Coba muat ulang halaman."); }); }, []);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); try { const result = await authRequest<Profile>("profile", { fullName: name }); setData(result); setName(result.fullName); setMessage("Profil berhasil disimpan."); window.dispatchEvent(new Event("account-updated")); } catch (error) { setMessage(error instanceof Error ? error.message : "Profil gagal disimpan."); } finally { setBusy(false); } }
  if (!data) return <main id="main" className="container account-page"><p role="status">{message || "Memuat akun..."}</p></main>;
  if (profile) return <main id="main" className="container account-page"><div className="account-profile"><h1>Profil saya</h1><p>Kelola informasi dasar akunmu.</p><form onSubmit={save}><div className="form-field"><label htmlFor="fullName">Nama</label><Input id="fullName" value={name} onChange={event => setName(event.target.value)} maxLength={100} required autoComplete="name" /></div><div className="form-field"><label htmlFor="accountEmail">Email</label><Input id="accountEmail" value={data.user.email} readOnly /></div><Button disabled={busy} type="submit">{busy ? "Menyimpan..." : "Simpan perubahan"}</Button></form>{message && <p className="account-status" role="status">{message}</p>}</div></main>;
  return <main id="main" className="container account-page"><section className="account-hero"><div><h1>Halo, {data.fullName || data.user.name || "selamat datang"}.</h1><p>Semua kebutuhan digitalmu bisa dimulai dari sini.</p></div><aside><strong>Akunmu</strong><p>{data.user.email}</p><p><Link href="/profil">Lihat profil</Link></p></aside></section><section className="account-section"><h2>Mau melakukan apa hari ini?</h2><div className="account-links"><Link className="account-link" href="/katalog"><strong>Jelajahi katalog</strong><p>Temukan layanan untuk game dan kebutuhan harian.</p></Link><Link className="account-link" href="/profil"><strong>Profil saya</strong><p>Perbarui nama dan lihat informasi akun.</p></Link><Link className="account-link" href="/bantuan"><strong>Pusat bantuan</strong><p>Temukan jawaban tentang layanan kami.</p></Link></div></section></main>;
}
