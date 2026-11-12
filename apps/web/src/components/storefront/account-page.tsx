"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authRequest } from "@/lib/auth-api";

type User = { email: string; name: string };
type Profile = { user: User; fullName: string };
export function AccountPage({ profile = false }: { profile?: boolean }) {
  const [data, setData] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { authRequest<Profile>("profile").then(setData).catch(error => { if (error instanceof Error && error.message === "Silakan masuk kembali.") window.location.replace("/login"); else setMessage("Profil tidak dapat dimuat. Coba muat ulang halaman."); }); }, []);
  if (!data) return <main id="main" className="container account-page"><p role="status">{message || "Memuat akun..."}</p></main>;
  if (profile) return <main id="main" className="container account-page"><div className="account-profile"><h1>Profil saya</h1><p>Informasi dasar akunmu.</p><dl className="account-profile-details"><div><dt>Nama</dt><dd>{data.fullName || data.user.name || "Belum tersedia"}</dd></div><div><dt>Email</dt><dd>{data.user.email || "Belum tersedia"}</dd></div></dl></div></main>;
  return <main id="main" className="container account-page"><section className="account-hero"><div><h1>Halo, {data.fullName || data.user.name || "selamat datang"}.</h1><p>Semua kebutuhan digitalmu bisa dimulai dari sini.</p></div><aside><strong>Akunmu</strong><p>{data.user.email}</p><p><Link href="/profil">Lihat profil</Link></p></aside></section><section className="account-section"><h2>Mau melakukan apa hari ini?</h2><div className="account-links"><Link className="account-link" href="/katalog"><strong>Jelajahi katalog</strong><p>Temukan layanan untuk game dan kebutuhan harian.</p></Link><Link className="account-link" href="/profil"><strong>Profil saya</strong><p>Lihat informasi akunmu.</p></Link><Link className="account-link" href="/bantuan"><strong>Pusat bantuan</strong><p>Temukan jawaban tentang layanan kami.</p></Link></div></section></main>;
}
