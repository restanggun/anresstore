"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Sample = { at: number; latency: number | null };
async function checkApi(): Promise<Sample> {
  const start = performance.now();
  const url = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${url}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    if (!response.ok || data.status !== "ok" || data.service !== "anres-api") throw new Error("API tidak tersedia");
    return { at: Date.now(), latency: Math.round(performance.now() - start) };
  } catch { return { at: Date.now(), latency: null }; }
}
export function useApiHealth() {
  const query = useQuery({ queryKey: ["api-health"], queryFn: checkApi, refetchInterval: 60000, refetchIntervalInBackground: false, staleTime: 30000 });
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => {
    if (query.data) setSamples(previous => previous.some(sample => sample.at === query.data!.at) ? previous : [...previous, query.data!].slice(-60));
  }, [query.data]);
  return { health: !query.data ? "checking" as const : query.data.latency === null ? "offline" as const : "online" as const, checked: query.data ? new Date(query.data.at) : null, samples, refresh: query.refetch, fetching: query.isFetching };
}
export function HealthChart({ samples }: { samples: Sample[] }) {
  const available = samples.filter(sample => sample.latency !== null);
  return <section className="panel chart-panel"><div className="panel-heading"><div><h2>Waktu respons API</h2><p>Pengukuran dari browser ini setiap menit selama halaman terbuka.</p></div><span className="muted-badge">Milidetik</span></div>
    {available.length ? <><div className="health-chart" role="img" aria-label={`Grafik waktu respons API, ${available.length} pengukuran berhasil. Pengukuran terakhir ${available[available.length-1]?.latency} milidetik.`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={samples} margin={{top:15,right:12,left:-18,bottom:0}}><CartesianGrid stroke="#e9eef1" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="at" tickFormatter={value => new Date(value).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})} tick={{fontSize:10,fill:"#8998a1"}} axisLine={false} tickLine={false} minTickGap={28}/><YAxis tick={{fontSize:10,fill:"#8998a1"}} axisLine={false} tickLine={false} width={48} allowDecimals={false}/><Tooltip labelFormatter={value => new Date(Number(value)).toLocaleTimeString("id-ID")} formatter={value => [`${value} ms`, "Waktu respons"]} contentStyle={{border:"1px solid #e3e7eb",borderRadius:12,fontSize:11}}/><Area type="monotone" dataKey="latency" stroke="#58a8cb" fill="#d9f0fc" strokeWidth={2} dot={{r:3,fill:"#58a8cb"}} connectNulls={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><p className="chart-footnote">{samples.length} pemeriksaan · {samples.length-available.length} tidak terjangkau. Riwayat tidak disimpan setelah halaman ditutup.</p></> : <div className="chart-empty"><div className="chart-message"><strong>Belum ada pengukuran berhasil</strong><span>Grafik muncul ketika API dapat dijangkau.</span></div></div>}
  </section>;
}
