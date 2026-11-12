"use client";
import { useState } from "react";
import { Search, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@anres/ui";
import { questions } from "@/lib/storefront";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { FaqList } from "./faq-list";
import { TextLink } from "./text-link";
const answers: [string, string][] = [...questions,
 ["Bagaimana cara memilih layanan?","Buka halaman Katalog, pilih kategori, atau ketik nama layanan di pencarian. Tekan kartu layanan untuk membaca informasi yang tersedia."],
 ["Apakah akun sudah bisa digunakan?","Akses login dan pendaftaran masih disiapkan. Kamu bisa melihat katalog dan informasi layanan tanpa membuat akun."],
 ["Apakah harga di katalog sudah final?","Harga belum dipublikasikan. Harga serta ketentuan final akan ditampilkan ketika katalog dan sistem pemesanan dibuka."],
];
export function HelpContent() {
 const [query,setQuery]=useState("");
 const visible=answers.filter(([q,a])=>`${q} ${a}`.toLowerCase().includes(query.toLowerCase().trim()));
 return <main id="main" className="container help-page"><section className="help-intro"><div className="help-mark" aria-hidden="true">?</div><h1><TextGenerateEffect as="span" words="Kita cari jawabannya." duration={0.34}/></h1><p>Informasi layanan, katalog, dan akun Anres Store.</p><div className="search"><Search size={20} aria-hidden="true"/><label className="sr-only" htmlFor="faq-search">Cari pertanyaan</label><Input id="faq-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ketik pertanyaanmu"/></div></section><section className="help-content"><aside><h2>Pertanyaan umum</h2><p>Mulai dari informasi yang paling sering kamu perlukan.</p><TextLink href="/katalog">Lihat katalog</TextLink></aside><div><p className="result-count" role="status">{visible.length} jawaban ditemukan</p><FaqList items={visible} animateQuestions/>{!visible.length&&<div className="empty-state"><h3>Belum ada jawaban yang cocok.</h3><p>Coba kata seperti katalog, akun, atau harga.</p><Button variant="outline" onClick={()=>setQuery("")}>Lihat semua pertanyaan</Button></div>}</div></section><div className="support-note"><Info size={20} aria-hidden="true"/><div><h2><TextGenerateEffect as="span" words="Butuh bantuan langsung?" duration={0.24}/></h2><p>Kontak bantuan terverifikasi akan tersedia saat layanan resmi dibuka. Untuk saat ini, informasi terbaru tersedia di halaman ini.</p></div></div></main>;
}
