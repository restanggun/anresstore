"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { FaqList } from "./faq-list";
import { TextLink } from "./text-link";
import { HelpChat } from "./help-chat";
const categories: { name: string; items: [string, string][] }[] = [
 { name: "Umum", items: [
  ["Apa itu Anres Store?", "Anres Store adalah website katalog layanan digital. Kamu bisa menjelajahi layanan dan mencoba alur pemesanan yang masih berupa simulasi."],
  ["Apa saja layanan yang ada di Anres Store?", "Katalog mencakup top up game, PPOB, booster media sosial, aplikasi premium, dan format tugas."],
  ["Apakah saya harus punya akun untuk melihat katalog?", "Tidak. Kamu bisa melihat dan mencari layanan di katalog tanpa masuk ke akun."],
  ["Apakah transaksi sudah tersedia?", "Belum. Pemesanan, checkout, dan pembayaran masih berupa simulasi; tidak ada pembayaran yang diproses."],
 ]},
 { name: "Katalog & layanan", items: [
  ["Bagaimana cara mencari layanan?", "Buka Katalog, lalu gunakan pencarian atau pilih kategori untuk menemukan layanan yang kamu cari."],
  ["Bagaimana cara melihat detail produk?", "Tekan kartu layanan di katalog untuk melihat informasi dan pilihan yang tersedia."],
  ["Layanan game apa saja yang bisa saya lihat?", "Katalog menampilkan pilihan seperti Mobile Legends, Free Fire, Roblox, PUBG Mobile, Genshin Impact, dan Valorant. Ketersediaan transaksi masih menunggu layanan resmi dibuka."],
  ["Apa yang termasuk layanan PPOB?", "Kategori PPOB mencakup kebutuhan seperti pulsa, paket data, token listrik, dan e-wallet."],
  ["Apa itu layanan format tugas?", "Kategori ini membantu kamu menjelajahi layanan format dokumen seperti artikel, makalah, tesis, skripsi, esai, dan laporan. Rincian pekerjaan akan dijelaskan ketika layanan tersedia."],
  ["Bagaimana jika layanan yang saya cari tidak ditemukan?", "Coba kata kunci lain atau periksa kategori di katalog. Jika masih belum ditemukan, tanyakan melalui asisten di halaman bantuan."],
 ]},
 { name: "Akun & keamanan", items: [
  ["Bagaimana cara membuat akun?", "Pilih Daftar, lalu ikuti petunjuk pendaftaran menggunakan email dan metode yang tersedia."],
  ["Bagaimana cara masuk ke akun?", "Pilih Login dan ikuti petunjuk masuk. Pilihan password, kode email, atau Google bergantung pada layanan yang tersedia."],
  ["Bagaimana jika saya lupa password?", "Gunakan pilihan pemulihan password pada halaman masuk dan ikuti petunjuk yang tersedia."],
  ["Mengapa saya perlu mengonfirmasi email?", "Konfirmasi membantu memastikan alamat email dapat digunakan untuk akun. Ikuti petunjuk yang ditampilkan saat pendaftaran."],
  ["Bagaimana cara melihat profil atau keluar?", "Setelah masuk, buka halaman Profil untuk melihat informasi akun dan pilihan keluar."],
  ["Bisakah saya mengubah nama atau email di profil?", "Perubahan nama dan email belum tersedia di halaman profil saat ini."],
  ["Apakah saya boleh memberikan password atau kode OTP kepada CS?", "Jangan bagikan password, kode OTP, token, atau data sensitif kepada siapa pun, termasuk melalui chat bantuan."],
 ]},
 { name: "Keranjang & pesanan", items: [
  ["Bagaimana cara menambahkan layanan ke keranjang?", "Buka produk di katalog, isi detail yang diminta, lalu tambahkan ke keranjang. Alur ini masih berupa simulasi."],
  ["Bisakah saya mengubah atau menghapus isi keranjang?", "Bisa. Buka keranjang untuk mengubah jumlah, mengedit tujuan dan kontak, atau menghapus item."],
  ["Apa yang terjadi pada keranjang saat saya masuk?", "Keranjang tamu disimpan di browser dan dapat digabungkan dengan keranjang akun saat kamu masuk, jika layanan dan konfigurasi tersedia."],
  ["Apakah checkout membuat pesanan sungguhan?", "Belum. Checkout dan pesanan saat ini hanya simulasi dan tidak memproses transaksi nyata."],
  ["Di mana saya bisa melihat invoice?", "Buka halaman Invoice untuk melihat simulasi yang tersimpan, termasuk detail dan status contohnya."],
  ["Apakah status invoice menunjukkan transaksi nyata?", "Tidak. Status pada invoice saat ini adalah contoh dalam simulasi, bukan status pembayaran atau pengiriman nyata."],
 ]},
 { name: "Harga & pembayaran", items: [
  ["Apakah harga di katalog sudah final?", "Harga dan ketentuan final akan ditampilkan saat katalog dan sistem pemesanan resmi dibuka. Angka dalam alur saat ini merupakan simulasi."],
  ["Metode pembayaran apa yang tersedia?", "Pembayaran belum dibuka dan tidak ada metode pembayaran yang memproses transaksi saat ini."],
  ["Apakah saya perlu membayar simulasi checkout?", "Tidak. Simulasi checkout tidak memproses pembayaran."],
  ["Kapan layanan dan pembayaran resmi dibuka?", "Jadwal pembukaan belum diumumkan. Informasi resmi akan ditampilkan ketika layanan siap."],
 ]},
 { name: "Bantuan", items: [
  ["Bagaimana jika jawaban cepat tidak membantu?", "Cari pertanyaanmu di halaman ini. Jika tidak ada jawaban yang cocok, kamu dapat bertanya kepada asisten AI dan kemudian memilih bantuan CS jika masih diperlukan."],
  ["Bagaimana cara menghubungi CS?", "Jika asisten belum membantu atau tidak tersedia, pilih Hubungi CS untuk menyimpan permintaan bantuan. Sistem admin dan balasan CS masih disiapkan."],
  ["Kapan CS akan membalas permintaan saya?", "Sistem balasan CS masih disiapkan, sehingga waktu respons belum dapat dijanjikan."],
  ["Apakah asisten AI bisa melihat akun atau pesanan saya?", "Tidak. Asisten tidak dapat melihat akun, pesanan, pembayaran, atau data pribadi dan tidak dapat melakukan transaksi."],
 ]},
];
export function HelpContent() {
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("Semua");
 const term=query.toLowerCase().trim();
 const matches=categories.map(group=>({...group,items:group.items.filter(([q,a])=>`${q} ${a}`.toLowerCase().includes(term))})).filter(group=>group.items.length);
 const visible=term ? matches : matches.filter(group=>category === "Semua" || group.name === category);
 const count=visible.reduce((total,group)=>total+group.items.length,0);
 return <main id="main" className="container help-page"><section className="help-intro"><div className="help-mark" aria-hidden="true">?</div><h1><TextGenerateEffect as="span" words="Kita cari jawabannya." duration={0.34}/></h1><p>Informasi layanan, katalog, dan akun Anres Store.</p><div className="search"><Search size={20} aria-hidden="true"/><label className="sr-only" htmlFor="faq-search">Cari pertanyaan</label><Input id="faq-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ketik pertanyaanmu"/>{term && !matches.length && <button className="help-ask-ai" type="button" onClick={()=>document.getElementById("help-chat-input")?.focus()}>Tanya AI Anres</button>}</div></section>{matches.length ? <section className="help-content"><aside><h2>Jawaban cepat</h2><p>Pilih kategori atau cari pertanyaan yang ingin kamu ketahui.</p><nav className="help-categories" aria-label="Kategori jawaban cepat">{["Semua",...categories.map(group=>group.name)].map(name=><button key={name} type="button" aria-pressed={!term && category === name} onClick={()=>{setCategory(name);setQuery("");}}>{name}</button>)}</nav><TextLink href="/katalog">Lihat katalog</TextLink></aside><div><p className="result-count" role="status">{count} jawaban ditemukan{term ? " di semua kategori" : ""}</p>{visible.map(group=><section className="help-faq-group" key={group.name} aria-labelledby={`faq-${categories.indexOf(categories.find(item=>item.name===group.name)!)}`}><h2 id={`faq-${categories.indexOf(categories.find(item=>item.name===group.name)!)}`}>{group.name}</h2><FaqList items={group.items}/></section>)}</div></section> : <HelpChat query={query}/>}</main>;
}
