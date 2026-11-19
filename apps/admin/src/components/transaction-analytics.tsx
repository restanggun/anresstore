"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";
import { ArrowUpRight, ShoppingBag, Wallet, PackageCheck, CircleAlert, RefreshCw, ArrowRight } from "lucide-react";
import { CustomSelect } from "./custom-select";
import { adminRequest, rupiah, stateLabel } from "./workspace-api";
import { OrderWorkspace } from "./order-workspace";

const number = new Intl.NumberFormat("id-ID");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const formatDay = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const dayLabel = (value: string) => formatDay.format(new Date(value + "T12:00:00+07:00"));
const paymentGroups = [
  { key: "paidCount", label: "Lunas", color: "var(--chart-blue)" },
  { key: "pendingCount", label: "Menunggu", color: "var(--chart-blue-muted)" },
  { key: "failedCount", label: "Gagal/Batal", detail: "Gagal, kedaluwarsa, atau batal", color: "var(--chart-pink)" },
  { key: "refundedCount", label: "Refund", detail: "Dana dikembalikan", color: "var(--chart-lavender)" },
  { key: "unknownCount", label: "Belum pasti", color: "var(--chart-slate)" },
] as const;
const fulfillmentColors: Record<string, string> = {
  completed: "var(--chart-blue)", delivered: "var(--chart-blue)", accepted: "var(--chart-blue)",
  failed: "var(--chart-pink)", cancelled: "var(--chart-pink)", rejected: "var(--chart-pink)",
  revision_requested: "var(--chart-pink)", new: "var(--chart-pink)",
  ready: "var(--chart-blue-muted)", dispatching: "var(--chart-blue-muted)", processing: "var(--chart-blue-muted)",
  in_progress: "var(--chart-blue-muted)", queued: "var(--chart-blue-muted)", working: "var(--chart-blue-muted)",
  revision_working: "var(--chart-blue-muted)",
  manual_review: "var(--chart-lavender)", not_ready: "var(--chart-slate)", unknown: "var(--chart-slate)",
};
const chartTooltip = { borderRadius: 8, borderColor: "var(--border)", backgroundColor: "var(--surface)" };
const trendMetrics = {
  paidCount: { label: "Total penjualan", total: "paidCount", format: number.format },
  paid: { label: "Omzet", total: "paidAmount", format: rupiah },
  cost: { label: "Modal", total: "costAmount", format: rupiah },
  profit: { label: "Laba tercatat", total: "profitAmount", format: rupiah },
} as const;

type PaymentKey = (typeof paymentGroups)[number]["key"];
type Daily = Record<PaymentKey, number> & { date: string; paid: number; cost: number; profit: number };
type Analytics = {
  summary: Record<PaymentKey, number> & {
    orders: number; paidAmount: number; completed: number; needsReview: number;
    costAmount: number; profitAmount: number; unknownCostCount: number; historicalCount: number;
  };
  daily: Daily[];
  statuses: { name: string; value: number }[];
  products: { name: string; value: number; amount: number }[];
};
type ProviderBalance = { available: boolean; balance: number | null; status?: "setup_required" | "unavailable" };
type ProviderBalances = { tripay: ProviderBalance; vipayment: ProviderBalance };

export function TransactionAnalytics({ overview = false, onNavigate }: { overview?: boolean; onNavigate?: (section: string, status?: string) => void }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<keyof typeof trendMetrics>("paidCount");
  const [distribution, setDistribution] = useState<"payment" | "fulfillment">("payment");
  const client = useQueryClient();
  const query = useQuery<Analytics>({
    queryKey: ["analytics", days],
    queryFn: () => adminRequest("analytics?days=" + days),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const balances = useQuery<ProviderBalances>({
    queryKey: ["provider-balances"],
    queryFn: () => adminRequest("provider-balances"),
    enabled: overview,
    refetchInterval: 60_000,
    retry: 1,
  });
  const data = query.data;
  const summary = data?.summary;
  const trend = trendMetrics[metric];
  const hasTransactions = Boolean(summary?.orders);
  const hasSales = Boolean(summary?.paidCount);
  const busy = query.isFetching || (overview && balances.isFetching);
  const emptyMessage = query.isPending ? "Memuat data…" : data ? "Belum ada transaksi pada periode ini." : "Data belum tersedia.";
  const missingCost = summary?.unknownCostCount
    ? number.format(summary.unknownCostCount) + " transaksi lunas belum memiliki modal"
    : "Transaksi lunas dengan modal tercatat";
  const cards = [
    { label: "Total penjualan", value: summary?.paidCount, icon: ShoppingBag, hint: summary?.historicalCount ? number.format(summary.historicalCount) + " dari riwayat QRIS" : "Transaksi lunas", target: "payments", status: "paid" },
    { label: "Omzet", value: summary && rupiah(summary.paidAmount), icon: Wallet, hint: "Nilai penjualan lunas", target: "payments", status: "paid" },
    { label: "Menunggu pembayaran", value: summary?.pendingCount, icon: Wallet, hint: "Termasuk pembayaran dalam verifikasi", target: "payments", status: "pending" },
    { label: "Gagal, kedaluwarsa, atau batal", value: summary?.failedCount, icon: CircleAlert, hint: days + " hari terakhir", target: "payments", status: "failed" },
    { label: "Dana dikembalikan", value: summary?.refundedCount, icon: Wallet, hint: days + " hari terakhir", target: "payments", status: "refunded" },
    { label: "Pembayaran belum pasti", value: summary?.unknownCount, icon: CircleAlert, hint: days + " hari terakhir", target: "payments", status: "unknown" },
    { label: "Pesanan selesai", value: summary?.completed, icon: PackageCheck, hint: "Pemrosesan selesai", target: "orders", status: "completed" },
    { label: "Perlu ditinjau", value: summary?.needsReview, icon: CircleAlert, hint: "Antrean semua waktu", target: "fulfillment", status: "review", attention: true },
    { label: "Harga modal terjual", value: summary && (summary.paidCount > 0 && summary.unknownCostCount === summary.paidCount ? "—" : rupiah(summary.costAmount)), icon: Wallet, hint: missingCost },
    { label: "Keuntungan tercatat", value: summary && (summary.paidCount > 0 && summary.unknownCostCount === summary.paidCount ? "—" : rupiah(summary.profitAmount)), icon: ArrowUpRight, hint: missingCost },
  ];
  const distributionRows = !summary ? [] : distribution === "payment"
    ? paymentGroups.map(({ key, label, color }) => ({ name: label, value: summary[key], color }))
    : data.statuses.map(({ name, value }) => ({ name: stateLabel(name), value, color: fulfillmentColors[name] ?? "var(--chart-slate)" }));
  const pieRows = distributionRows.filter(row => row.value > 0);
  const activityCount = distributionRows.reduce((total, row) => total + row.value, 0);
  const bestProductCount = data?.products[0]?.value ?? 1;

  function refresh() {
    void query.refetch();
    if (overview) {
      void balances.refetch();
      void client.invalidateQueries({ queryKey: ["order-records", "orders"] });
    }
  }

  return (
    <div className="commerce-dashboard">
      <div className="workspace-heading">
        <div>
          <h1>{overview ? "Ringkasan toko" : "Laporan transaksi"}</h1>
          <p>Transaksi produksi dan riwayat QRIS berdasarkan tanggal transaksi (WIB).</p>
        </div>
        <div className="heading-actions">
          <CustomSelect aria-label="Periode laporan" value={days} onChange={event => setDays(Number(event.target.value))}>
            {[7, 30, 90].map(period => <option key={period} value={period}>{period} hari terakhir</option>)}
          </CustomSelect>
          <button className="square-button" aria-label="Perbarui laporan" disabled={busy} onClick={refresh}>
            <RefreshCw size={16} className={busy ? "spinning" : ""} />
          </button>
        </div>
      </div>

      {query.error && <div className="workspace-error" role="alert">{query.error.message}<button onClick={() => void query.refetch()}>Coba lagi</button></div>}

      <div className="commerce-metrics">
        {cards.map(({ label, value, icon: Icon, hint, target, status, attention }) => {
          const className = "commerce-metric" + (attention ? " metric-attention" : "");
          const content = <>
            <div><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
            <strong>{typeof value === "number" ? number.format(value) : value ?? (query.isPending ? "…" : "—")}</strong>
            <small>{hint}</small>
          </>;
          return target && onNavigate
            ? <button key={label} type="button" className={className} onClick={() => onNavigate(target, status)}>{content}<ArrowUpRight className="metric-link" size={15} aria-hidden="true" /></button>
            : <div key={label} className={className}>{content}</div>;
        })}
        {overview && (["tripay", "vipayment"] as const).map(key => {
          const provider = balances.data?.[key];
          return <div key={key} className="commerce-metric">
            <div><span>{key === "tripay" ? "Saldo Tripay H2H" : "Saldo VIPayment"}</span><Wallet size={18} aria-hidden="true" /></div>
            <strong>{provider?.available && typeof provider.balance === "number" ? rupiah(provider.balance) : balances.isPending ? "…" : "—"}</strong>
            <small>{provider?.status === "setup_required" ? "Kredensial Tripay H2H belum dikonfigurasi" : provider?.available ? "Saldo aktual" : balances.isPending ? "Memuat saldo…" : "Saldo belum dapat dimuat"}</small>
          </div>;
        })}
      </div>

      <div className="commerce-chart-grid">
        <section className="commerce-panel trend-panel">
          <div className="panel-title">
            <div><h2>Tren penjualan</h2><p>Penjualan lunas per hari · WIB</p></div>
            <CustomSelect aria-label="Metrik tren" value={metric} onChange={event => setMetric(event.target.value as keyof typeof trendMetrics)}>
              {Object.entries(trendMetrics).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
            </CustomSelect>
          </div>
          <div className="chart-total"><strong>{summary ? trend.format(summary[trend.total]) : "—"}</strong><span>{days} hari terakhir</span></div>
          <div className="commerce-chart">
            {hasSales && data ? <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily} margin={{ top: 14, right: 16, bottom: 0, left: 0 }} aria-label={"Grafik garis " + trend.label} aria-describedby="report-daily-heading">
                <CartesianGrid vertical={false} stroke="#e9eef2" strokeDasharray="3 4" />
                <XAxis dataKey="date" tickFormatter={dayLabel} axisLine={false} tickLine={false} minTickGap={35} tick={{ fill: "var(--muted)", fontSize: 12 }} dy={8} />
                <YAxis width={52} tickFormatter={compact.format} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} domain={metric === "profit" ? ["auto", "auto"] : [0, (max: number) => Math.max(max, 1)]} />
                <Tooltip contentStyle={chartTooltip} labelFormatter={value => dayLabel(String(value))} formatter={value => [trend.format(Number(value)), trend.label]} />
                <Line type="monotoneX" dataKey={metric} stroke="var(--chart-blue)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" dot={days === 7 ? { r: 3, fill: "var(--surface)", strokeWidth: 2 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer> : <div className="chart-placeholder">{data ? "Belum ada penjualan lunas pada periode ini." : emptyMessage}</div>}
          </div>
        </section>

        <section className="commerce-panel distribution-panel">
          <div className="panel-title">
            <div><h2>Komposisi aktivitas</h2><p>Status pada periode terpilih</p></div>
            <CustomSelect aria-label="Jenis status" value={distribution} onChange={event => setDistribution(event.target.value as typeof distribution)}>
              <option value="payment">Pembayaran</option><option value="fulfillment">Pemrosesan</option>
            </CustomSelect>
          </div>
          {pieRows.length ? <>
            <div className="donut-wrap" aria-hidden="true">
              <ResponsiveContainer width="100%" height={204}>
                <PieChart accessibilityLayer={false}>
                  <Pie data={pieRows} dataKey="value" nameKey="name" innerRadius={65} outerRadius={87} paddingAngle={4} cornerRadius={2} stroke="none" isAnimationActive={false}>
                    {pieRows.map(row => <Cell key={row.name} fill={row.color} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltip} formatter={value => number.format(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{number.format(activityCount)}</strong><span>aktivitas</span></div>
            </div>
            <div className="chart-legend">
              {distributionRows.map(row => <div key={row.name}><span><i aria-hidden="true" style={{ background: row.color }} />{row.name}</span><strong>{number.format(row.value)}</strong></div>)}
            </div>
          </> : <div className="distribution-empty">{emptyMessage}</div>}
        </section>
      </div>

      {!overview && <div className="commerce-chart-grid report-grid">
        <section className="commerce-panel">
          <div className="panel-title"><div><h2>Aktivitas pembayaran</h2><p>Jumlah per status pembayaran · WIB</p></div></div>
          <div className="commerce-chart">
            {hasTransactions && data ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} aria-label="Volume harian per status pembayaran" aria-describedby="report-daily-heading">
                <CartesianGrid vertical={false} stroke="#e9eef2" />
                <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={40} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} width={35} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltip} labelFormatter={value => dayLabel(String(value))} />
                <Legend iconType="circle" />
                {paymentGroups.map(({ key, label, color }) => <Bar key={key} dataKey={key} name={label} fill={color} radius={2} stackId="payments" maxBarSize={30} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer> : <div className="chart-placeholder">{emptyMessage}</div>}
          </div>
        </section>
        <section className="commerce-panel">
          <div className="panel-title"><div><h2>Produk terlaris</h2><p>Diurutkan berdasarkan jumlah transaksi lunas pada periode terpilih</p></div></div>
          {data?.products.length ? <div className="product-ranking">
            {data.products.map((product, index) => <div key={product.name}>
              <span className="rank-number">{index + 1}</span>
              <div><strong>{product.name}</strong><div className="ranking-track" aria-hidden="true"><i style={{ width: (product.value / bestProductCount * 100) + "%" }} /></div></div>
              <span>{number.format(product.value)} lunas · {rupiah(product.amount)}</span>
            </div>)}
          </div> : <div className="chart-placeholder">{hasTransactions ? "Belum ada produk dengan transaksi lunas pada periode ini." : emptyMessage}</div>}
        </section>
      </div>}

      {data && <details className="commerce-panel report-daily" open={!overview}>
        <summary id="report-daily-heading">Rincian transaksi harian</summary>
        <p className="report-cost-note">Jika modal pesanan lama kosong, laporan memakai modal katalog untuk varian yang cocok.</p>
        <div className="commerce-table-wrap" tabIndex={0} role="region" aria-labelledby="report-daily-heading">
          <table className="commerce-table">
            <caption className="sr-only">Status pembayaran dan nominal per tanggal transaksi (WIB)</caption>
            <thead><tr>
              <th scope="col">Tanggal WIB</th>
              {paymentGroups.map(group => <th key={group.key} scope="col" className="numeric" aria-label={"detail" in group ? group.detail : undefined}>{group.label}</th>)}
              <th scope="col" className="numeric">Omzet</th><th scope="col" className="numeric">Modal</th><th scope="col" className="numeric">Laba</th>
            </tr></thead>
            <tbody>{data.daily.map(row => <tr key={row.date}>
              <th scope="row">{dayLabel(row.date)}</th>
              {paymentGroups.map(({ key }) => <td key={key} className="numeric">{number.format(row[key])}</td>)}
              <td className="numeric">{rupiah(row.paid)}</td><td className="numeric">{rupiah(row.cost)}</td><td className="numeric">{rupiah(row.profit)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}

      {overview && <>
        <OrderWorkspace compact onViewAll={() => onNavigate?.("orders")} />
        <div className="overview-links"><span>Operasional berikutnya</span><button onClick={() => onNavigate?.("conversations")}>Buka chat pelanggan<ArrowRight size={15} /></button><button onClick={() => onNavigate?.("catalog")}>Kelola katalog &amp; harga<ArrowRight size={15} /></button></div>
      </>}
    </div>
  );
}
