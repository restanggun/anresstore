import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@anres/ui";

export default function NotFound() {
  return <main id="main" className="container not-found-page">
    <section className="not-found-panel">
      <div className="not-found-copy">
        <p className="section-kicker">Halaman tidak ditemukan</p>
        <h1>Sepertinya kamu tersesat.</h1>
        <p>Halaman yang kamu cari tidak tersedia atau sudah berpindah. Yuk, kembali menemukan kebutuhan digitalmu.</p>
        <div className="not-found-actions">
          <Button asChild><Link href="/"><ArrowLeft size={17} aria-hidden="true" />Kembali ke beranda</Link></Button>
          <Button asChild variant="outline"><Link href="/katalog"><Search size={17} aria-hidden="true" />Jelajahi katalog</Link></Button>
        </div>
      </div>
      <div className="not-found-art" aria-hidden="true"><span>4</span><span className="not-found-zero">?</span><span>4</span></div>
    </section>
  </main>;
}
