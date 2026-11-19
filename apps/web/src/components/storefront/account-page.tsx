"use client";
import Link from "@/components/storefront/domain-link";
import { useEffect, useState } from "react";
import { SupportInbox } from "./support-inbox";
import { authRequest, AuthRequestError } from "@/lib/auth-api";
import { domains } from "@/lib/domains";
import { PaymentHistory } from "./payment-history";
import { PremiumHistory } from "./premium-history";
import { CampaignPage } from "./campaign-page";
import { paymentRequest } from "@/lib/payment-api";
import { voucherDate, type AccountVoucher } from "./checkout-voucher";
import "./orders.css";

type User = { id: string; email: string; name: string };
type Profile = { user: User; fullName: string };
export function AccountPage({ profile = false }: { profile?: boolean }) {
  const [data, setData] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { let active=true; authRequest<Profile>("profile").then(value=>{if(active)setData(value);}).catch(error => { if(!active)return; if (error instanceof AuthRequestError && error.status===401) window.location.replace(`${domains.auth.replace(/\/$/, "")}/login`); else setMessage("Profil tidak dapat dimuat. Coba muat ulang halaman."); }); return()=>{active=false;}; }, []);
  if (!data) return <main id="main" className="container account-page"><p role="status">{message || "Memuat akun..."}</p></main>;
  if (profile) return <main id="main" className="container account-page"><div className="account-profile"><h1>Profil saya</h1><p>Informasi dasar akunmu.</p><dl className="account-profile-details"><div><dt>Nama</dt><dd>{data.fullName || data.user.name || "Belum tersedia"}</dd></div><div><dt>Email</dt><dd>{data.user.email || "Belum tersedia"}</dd></div></dl></div><SupportInbox/></main>;
  return <main id="main" className="container account-page"><section className="account-hero"><div><span>Dashboard saya</span><h1>Halo, {data.fullName || data.user.name || "selamat datang"}.</h1><p>Pantau transaksi dan lanjutkan kebutuhan digitalmu dari sini.</p></div><aside><strong>Akunmu</strong><p>{data.user.email}</p><p><Link href="/profil">Lihat profil</Link></p></aside></section><section className="account-section"><h2>Mau melakukan apa hari ini?</h2><div className="account-links"><Link className="account-link" href="/katalog"><strong>Jelajahi katalog</strong><p>Temukan layanan untuk game dan kebutuhan harian.</p></Link><Link className="account-link" href="/invoice"><strong>Invoice saya</strong><p>Lihat transaksi dan detail pembayaranmu.</p></Link><Link className="account-link" href="/bantuan"><strong>Pusat bantuan</strong><p>Temukan jawaban tentang layanan kami.</p></Link></div></section><CampaignPage embedded/><AccountVoucherWallet key={data.user.id}/><PaymentHistory accountUserId={data.user.id}/><PremiumHistory/><SupportInbox/></main>;
}

function AccountVoucherWallet() {
  const [rows, setRows] = useState<AccountVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void paymentRequest<{ rows: AccountVoucher[] }>("vouchers", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(result => { if (!controller.signal.aborted) setRows(result.rows); }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section className="account-section">
    <h2>Voucher saya</h2>
    {error ? <p role="status">Voucher belum dapat dimuat. Coba muat ulang dashboard.</p> : loading ? <p role="status">Memuat voucher akun...</p> : rows.length ? <div className="account-links">{rows.map(row => <div className="account-link" key={row.id}>
      <strong>{row.name}</strong>
      <p>Berlaku sampai {voucherDate.format(new Date(row.ends_at))} WIB</p>
    </div>)}</div> : <p>Belum ada voucher aktif. Reward referral yang disetujui admin akan tampil di sini.</p>}
    {!!rows.length && <p>Pilih voucher akun saat checkout produk yang memenuhi syarat.</p>}
  </section>;
}
