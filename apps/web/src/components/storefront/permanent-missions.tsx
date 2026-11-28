"use client";

import { useEffect, useState } from "react";
import { Button } from "@anres/ui";
import { resellerRequest, ResellerRequestError, resellerRupiah, type ResellerSnapshot } from "@/lib/reseller-api";
import Link from "./domain-link";
import styles from "./reseller-dashboard.module.css";

type MissionSnapshot = ResellerSnapshot & {
  rewards: { tier: "perak" | "emas"; voucher: string | null; claimed: boolean }[];
};
const retailGoals = { perak: 250000, emas: 1000000 };
const wholesaleGoals = { pro: 2000000, partner: 10000000 };

export function PermanentMissions() {
  const [data, setData] = useState<MissionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<MissionSnapshot>("missions", undefined, controller.signal).then(setData).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ResellerRequestError && cause.status === 401) setGuest(true);
      else setError(cause instanceof ResellerRequestError ? cause.message : "Progres belum dapat dimuat.");
    });
    return () => controller.abort();
  }, []);

  async function claim(tier: string) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await resellerRequest(`missions/${tier}/claim`, {});
      setData(await resellerRequest<MissionSnapshot>("missions"));
      setNotice("Voucher tersedia di menu Voucher saya.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Voucher belum dapat diklaim."); }
    finally { setBusy(false); }
  }

  return <section id="permanen" className={`${styles.panel} ${styles.mission}`} tabIndex={-1} aria-labelledby="permanent-title">
    <h2 id="permanent-title">Misi Permanen</h2>
    <p>Transaksi yang sudah dibayar dan selesai menambah progres. Refund yang selesai mengurangi nilai yang dihitung.</p>
    {guest && <p><Link className="text-link" href="/login">Masuk untuk melihat progresmu</Link></p>}
    {!data && !guest && !error && <p role="status">Memuat progres...</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      <h3>Tier pembeli · {data.progress.retailTier}</h3>
      <p>Total belanja retail yang memenuhi syarat {resellerRupiah(data.progress.retailSpend)}.</p>
      <ul className={styles.list}>
        {data.rewards.map(reward => {
          const goal = retailGoals[reward.tier];
          return <li key={reward.tier}>
            <strong>Tier {reward.tier} · {resellerRupiah(goal)}</strong><br/>
            <progress className={styles.progress} max={goal} value={Math.min(goal, data.progress.retailSpend)} aria-label={`Progres tier ${reward.tier}`}/>
            {reward.claimed ? <p>Benefit pernah diklaim.</p> : reward.voucher
              ? <p>{reward.voucher} {data.progress.retailSpend >= goal && <Button type="button" disabled={busy} onClick={() => void claim(reward.tier)}>Klaim voucher</Button>}</p>
              : <p>Voucher untuk tier ini belum tersedia.</p>}
          </li>;
        })}
      </ul>
      {data.member?.status === "approved" && data.progress.activated ? <>
        <h3>Tier reseller · {data.progress.tier}</h3>
        <p>Volume 90 hari terakhir {resellerRupiah(data.progress.volume)}. Level yang lebih tinggi membuka harga khusus SKU tertentu dan menambah kuota API.</p>
        <ul className={styles.list}>{Object.entries(wholesaleGoals).map(([tier, goal]) => <li key={tier}>
          <strong>Tier {tier} · {resellerRupiah(goal)}</strong><br/>
          <progress className={styles.progress} max={goal} value={Math.min(goal, data.progress.volume)} aria-label={`Progres reseller ${tier}`}/>
        </li>)}</ul>
      </> : <p><Link className="text-link" href="/reseller">Pelajari cara menjadi reseller</Link></p>}
    </>}
  </section>;
}
