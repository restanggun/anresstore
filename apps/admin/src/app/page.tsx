const foundations = [
  ["Katalog & harga", "Menunggu produk MVP"],
  ["Pesanan & pembayaran", "Belum diaktifkan"],
  ["Akses administrator", "Menunggu implementasi Auth dan role"],
  ["Database", "Konfigurasi Supabase diperlukan"],
];

export default function AdminHome() {
  return <div className="mx-auto max-w-5xl px-6 py-10">
    <header className="flex items-center justify-between border-b border-[var(--border)] pb-6">
      <span className="text-xl font-bold">anres. <span className="font-normal text-[var(--muted)]">/ admin</span></span>
      <span className="rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900">Setup awal</span>
    </header>
    <main id="main" className="py-14">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--focus)]">Fondasi operasional</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Ruang kerja Anres Store</h1>
      <p className="mt-5 max-w-2xl leading-relaxed text-[var(--muted)]">Dashboard operasional sedang disiapkan. Halaman ini hanya menampilkan status setup; akses data dan tindakan admin akan tersedia setelah autentikasi dan otorisasi diterapkan.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">{foundations.map(([name, status]) =>
        <section key={name} className="rounded-xl border border-[var(--border)] bg-white p-7">
          <h2 className="font-semibold">{name}</h2><p className="mt-3 text-sm text-[var(--muted)]">{status}</p>
        </section>)}
      </div>
    </main>
  </div>;
}
