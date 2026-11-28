"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminInput } from "./form-controls";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./campaign-workspace.module.css";

type Member = { user_id: string; shop_name: string; whatsapp: string; status: keyof typeof states; revision: number };
type Price = { category: string; code: string; starter: number; pro: number; partner: number };
type Settings = { registrationOpen: boolean; members: Member[]; rewards: { perak_voucher_id: string | null; emas_voucher_id: string | null }; templates: { id: string; name: string }[] };
type Commission = { id: string; reseller_id: string; invoice_number: string; state: string; earned: number; payout_amount: number | null; payout_reference: string | null; adjustment_due: number };
const states = { pending: "Menunggu tinjauan", approved: "Disetujui", rejected: "Ditolak", suspended: "Ditangguhkan" };

export function ResellerWorkspace() {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [commissionPage, setCommissionPage] = useState(0);
  const [category, setCategory] = useState("game");
  const [notice, setNotice] = useState("");
  const members = useQuery({
    queryKey: ["reseller-admin", "members", page],
    queryFn: ({ signal }) => adminRequest(`resellers?page=${page}`, "GET", undefined, signal) as Promise<Settings>,
  });
  const prices = useQuery({
    queryKey: ["reseller-admin", "prices", category],
    queryFn: ({ signal }) => adminRequest(`resellers/prices?category=${category}`, "GET", undefined, signal) as Promise<{ prices: Price[] }>,
  });
  const commissions = useQuery({
    queryKey: ["reseller-admin", "commission", commissionPage],
    queryFn: ({ signal }) => adminRequest(`resellers/commissions?page=${commissionPage}`, "GET", undefined, signal) as Promise<{ percent: number; rows: Commission[] }>,
  });
  const write = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body: unknown }) => adminRequest(path, method, body),
    onMutate: () => setNotice(""),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["reseller-admin"] }); setNotice("Perubahan disimpan."); },
  });
  const review = (member: Member, status: string) => write.mutate({
    path: `resellers/members/${member.user_id}`, method: "PATCH", body: { revision: member.revision, status },
  });
  function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    write.mutate({ path: "resellers/prices", method: "POST", body: {
      category, code: String(data.get("code")).trim(), starter: Number(data.get("starter")),
      pro: Number(data.get("pro")), partner: Number(data.get("partner")),
    } });
  }
  const settings = members.data;
  return <div className={styles.workspace}>
    <div className="workspace-heading"><div><h1>Reseller</h1><p>Tinjau pengajuan, atur harga, dan pantau komisi pelanggan.</p></div></div>
    <section className={`commerce-panel ${styles.formPanel}`}>
      <h2>Pendaftaran reseller</h2>
      {members.isPending && <p role="status">Memuat pengajuan...</p>}
      {members.error && <p role="alert">{members.error.message}</p>}
      {settings && <>
        <p>Pendaftaran {settings.registrationOpen ? "dibuka" : "ditutup"}.</p>
        <button className="outline-button" type="button" disabled={write.isPending} onClick={() => write.mutate({
          path: "resellers/settings", method: "PATCH", body: { registrationOpen: !settings.registrationOpen },
        })}>{settings.registrationOpen ? "Tutup pendaftaran" : "Buka pendaftaran"}</button>
        {!settings.members.length && <p>Belum ada pengajuan di halaman ini.</p>}
        <ul className={styles.referrals}>
          {settings.members.map(member => <li key={member.user_id} className={`commerce-panel ${styles.queuePanel}`}>
            <h3>{member.shop_name}</h3>
            <p>{member.whatsapp} · {states[member.status]}</p>
            {member.status === "pending" && <>
              <button className="outline-button" type="button" disabled={write.isPending} onClick={() => review(member, "approved")}>Setujui</button>{" "}
              <button className="outline-button" type="button" disabled={write.isPending} onClick={() => review(member, "rejected")}>Tolak</button>
            </>}
            {member.status === "approved" && <button className="outline-button" type="button" disabled={write.isPending} onClick={() => review(member, "suspended")}>Tangguhkan</button>}
            {member.status === "suspended" && <button className="outline-button" type="button" disabled={write.isPending} onClick={() => review(member, "approved")}>Pulihkan akses</button>}
          </li>)}
        </ul>
        <div className={styles.actions}>
          <button className="outline-button" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</button>
          <button className="outline-button" type="button" disabled={settings.members.length < 25} onClick={() => setPage(page + 1)}>Berikutnya</button>
        </div>
      </>}
    </section>
    <section className={`commerce-panel ${styles.formPanel}`}>
      <h2>Harga reseller per SKU</h2>
      <label htmlFor="reseller-price-category">Kategori</label>{" "}
      <select id="reseller-price-category" value={category} onChange={event => setCategory(event.target.value)}>
        <option value="game">Top up game</option><option value="prepaid">Prabayar</option>
      </select>
      <form method="post" className={styles.grid} onSubmit={savePrice}>
        <label htmlFor="reseller-price-code">Kode SKU</label>
        <AdminInput id="reseller-price-code" name="code" required maxLength={100}/>
        {(["starter", "pro", "partner"] as const).map(tier => <div key={tier}>
          <label htmlFor={`reseller-price-${tier}`}>Harga {tier} (rupiah)</label>
          <AdminInput id={`reseller-price-${tier}`} name={tier} type="number" min={1} max={100000000} required/>
        </div>)}
        <button className="primary-button" type="submit" disabled={write.isPending}>Simpan harga</button>
      </form>
      {prices.isPending && <p role="status">Memuat harga...</p>}
      {prices.error && <p role="alert">{prices.error.message}</p>}
      {prices.data?.prices.map(price => <div key={price.code} className={`commerce-panel ${styles.queuePanel}`}>
        <strong>{price.code}</strong><p>Starter {rupiah(price.starter)} · Pro {rupiah(price.pro)} · Partner {rupiah(price.partner)}</p>
        <button className="outline-button" type="button" disabled={write.isPending} onClick={() => write.mutate({
          path: "resellers/prices", method: "POST", body: { category, code: price.code, remove: true },
        })}>Hapus harga reseller</button>
      </div>)}
    </section>
    {settings && <section className={`commerce-panel ${styles.formPanel}`}>
      <h2>Benefit tier pembeli</h2>
      <form method="post" className={styles.grid} key={JSON.stringify(settings.rewards)} onSubmit={event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        write.mutate({ path: "resellers/rewards", method: "PATCH", body: { perak: values.get("perak") || null, emas: values.get("emas") || null } });
      }}>
        {(["perak", "emas"] as const).map(tier => <div key={tier} className={styles.field}>
          <label htmlFor={`benefit-${tier}`}>Voucher {tier}</label>
          <select id={`benefit-${tier}`} name={tier} defaultValue={settings.rewards[`${tier}_voucher_id`] ?? ""}>
            <option value="">Pilih voucher akun</option>
            {settings.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>)}
        <button className="primary-button" type="submit" disabled={write.isPending}>Simpan benefit</button>
      </form>
    </section>}
    <section className={`commerce-panel ${styles.formPanel}`}>
      <h2>Checkout pelanggan dan komisi</h2>
      <p>Komisi dihitung dari persentase selisih harga publik dan harga Starter. Isi 0 untuk menonaktifkan checkout baru.</p>
      {commissions.error && <p role="alert">{commissions.error.message}</p>}
      {commissions.isPending && <p role="status">Memuat komisi...</p>}
      {commissions.data && <>
        <form method="post" className={styles.grid} key={commissions.data.percent} onSubmit={event => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          write.mutate({ path: "resellers/commissions", method: "PATCH", body: { percent: Number(values.get("percent")) } });
        }}>
          <div className={styles.field}>
            <label htmlFor="commission-rate">Persentase komisi (0–80)</label>
            <AdminInput type="number" min={0} max={80} id="commission-rate" name="percent" defaultValue={commissions.data.percent} required/>
          </div>
          <button className="primary-button" type="submit" disabled={write.isPending}>Simpan persentase</button>
        </form>
        {commissions.data.rows.map(row => <div className={`commerce-panel ${styles.queuePanel}`} key={row.id}>
          <strong>{row.invoice_number}</strong>
          <p>Reseller {row.reseller_id}</p>
          <p>{({ pending: "Menunggu transaksi", holding: "Masa tunggu", payable: "Siap dicairkan", paid_out: "Sudah cair", adjustment: "Periksa penyesuaian refund", reconciled: "Penyesuaian selesai", void: "Batal" } as Record<string, string>)[row.state] ?? row.state} · Komisi {rupiah(row.earned)}</p>
          {row.payout_reference && <p>Pencairan {rupiah(row.payout_amount ?? 0)} · Referensi {row.payout_reference}</p>}
          {(row.state === "payable" || row.state === "adjustment") && <form method="post" className={styles.grid} onSubmit={event => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const adjustment = row.state === "adjustment";
            write.mutate({ path: `resellers/commissions/${row.id}/${adjustment ? "adjustment" : "payout"}`, method: "POST",
              body: { amount: adjustment ? Number(values.get("amount")) : row.earned, reference: values.get("reference") } });
          }}>
            {row.state === "adjustment" && <div className={styles.field}>
              <label htmlFor={`adjustment-${row.id}`}>Nominal yang sudah dikembalikan (sisa {rupiah(row.adjustment_due)})</label>
              <AdminInput id={`adjustment-${row.id}`} name="amount" type="number" min={1} max={row.adjustment_due} required/>
            </div>}
            <div className={styles.field}>
              <label htmlFor={`payout-${row.id}`}>{row.state === "adjustment" ? "Referensi pengembalian" : "Referensi transfer yang sudah dilakukan"}</label>
              <AdminInput id={`payout-${row.id}`} name="reference" minLength={6} maxLength={100} required/>
            </div>
            <button className="primary-button" type="submit" disabled={write.isPending}>{row.state === "adjustment" ? "Catat pengembalian" : "Catat pencairan"}</button>
          </form>}
        </div>)}
        <button className="outline-button" type="button" disabled={commissionPage === 0} onClick={() => setCommissionPage(commissionPage - 1)}>Sebelumnya</button>{" "}
        <button className="outline-button" type="button" disabled={commissions.data.rows.length < 25} onClick={() => setCommissionPage(commissionPage + 1)}>Berikutnya</button>
      </>}
    </section>
    {write.error && <p className={styles.error} role="alert">{write.error.message}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
