"use client";
import { useQuery } from "@tanstack/react-query";
import { adminRequest } from "./workspace-api";
import { HealthChart } from "./health-chart";

type Check={name:string;count:number;severity:"critical"|"warning"};
type Status={at:string;status:"ok"|"attention";checks:Check[]};
export function SystemMonitor({samples,refresh,fetching}:{samples:{at:number;latency:number|null}[];refresh:()=>Promise<unknown>;fetching:boolean}){
  const query=useQuery<Status>({queryKey:["system-operations"],queryFn:()=>adminRequest("system/operations"),refetchInterval:60000});
  return <div className="system-monitor"><div className="workspace-heading"><div><h1>Status sistem</h1><p>Waktu respons API dan antrean transaksi produksi yang memerlukan perhatian.</p></div><button className="outline-button" disabled={fetching||query.isFetching} onClick={()=>void Promise.all([refresh(),query.refetch()])}>Periksa sekarang</button></div><HealthChart samples={samples}/><section className="panel"><div className="panel-heading"><div><h2>Antrean operasional</h2><p>{query.data?`Diperiksa ${new Date(query.data.at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB · ${query.data.status==="ok"?"Tidak ada antrean bermasalah":"Ada antrean yang perlu diperiksa"}`:"Data live dari database"}</p></div></div>{query.isPending?<p role="status">Memeriksa database...</p>:query.error?<p role="alert">{query.error.message} <button className="outline-button" onClick={()=>void query.refetch()}>Coba lagi</button></p>:<div className="system-checks">{query.data?.checks.map(check=><div key={check.name} className={check.count>0?`system-check ${check.severity}`:"system-check"}><span>{check.name}</span><strong>{check.count.toLocaleString("id-ID")}</strong></div>)}</div>}<p className="system-monitor-note">Angka ini menunjukkan kondisi saat pemeriksaan. Buka pesanan dan pembayaran untuk menindaklanjuti; pemeriksaan browser berhenti saat halaman ditutup.</p></section></div>;
}
