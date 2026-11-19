"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Share2, Star } from "lucide-react";
import { apiUrl } from "@/lib/auth-api";
import styles from "./product-reviews.module.css";

export type ReviewCategory = "game" | "prepaid" | "apps" | "social" | "tasks";
type Review = { id: string; rating: number; comment: string; author: string; created_at: string };
type ReviewFeed = { summary: { review_count: number; average_rating: number }; rows: Review[] };

export function ShareProductLink({ categorySlug, productSlug, productName }: { categorySlug: string; productSlug: string; productName: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(""), 5000); return () => clearTimeout(timer); }, [status]);
  async function share() {
    const url = new URL(`/katalog/${categorySlug}/${productSlug}`, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: `${productName} | Anres Store`, text: `Lihat ${productName} di Anres Store`, url }); setStatus("Tautan produk berhasil dibagikan."); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setStatus("Tautan produk disalin."); }
    catch { setStatus("Tautan belum tersalin. Coba salin alamat halaman dari browser."); }
  }
  return <div className={styles.shareWrap}><button className={styles.shareButton} type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true"/>Bagikan tautan</button>{status && <span className={styles.shareStatus} role="status" aria-live="polite">{status}</span>}</div>;
}

function Stars({ value }: { value: number }) {
  return <span className={styles.reviewStars} aria-label={`${value} dari 5 bintang`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} aria-hidden="true" fill={index < Math.round(value) ? "currentColor" : "none"}/>)}</span>;
}

export function ProductReviews({ category, productSlug, productName, enabled = true }: { category: ReviewCategory; productSlug: string; productName: string; enabled?: boolean }) {
  const [feed, setFeed] = useState<ReviewFeed>({ summary: { review_count: 0, average_rating: 0 }, rows: [] });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); setState("loading");
    fetch(`${apiUrl}/catalog/reviews/${encodeURIComponent(category)}/${encodeURIComponent(productSlug)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(); if (!data?.summary || !Array.isArray(data.rows)) throw new Error(); if (!controller.signal.aborted) { setFeed(data); setState("ready"); } })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [category, enabled, productSlug]);
  return <section className={styles.reviews} id="product-reviews" aria-labelledby="product-reviews-title">
    <div className={styles.heading}><div><span className={styles.kicker}>Pendapat pembeli terverifikasi</span><h2 id="product-reviews-title">Rating & ulasan {productName || productSlug.replace(/-/g, " ") || "produk"}</h2><p>Ulasan berasal dari invoice transaksi yang sudah selesai.</p></div>
      <div className={styles.summary} aria-label={feed.summary.review_count ? `Rata-rata ${feed.summary.average_rating} dari 5 bintang, ${feed.summary.review_count} ulasan` : "Belum ada ulasan"}><strong>{feed.summary.review_count ? Number(feed.summary.average_rating).toFixed(1) : "—"}</strong><Stars value={feed.summary.average_rating}/><span>{feed.summary.review_count} ulasan</span></div></div>
    <div className={styles.reviewList}>{state === "loading" && <p>Memuat ulasan…</p>}{state === "error" && <p className={styles.empty} role="status">Ulasan belum dapat dimuat. Coba muat ulang halaman.</p>}{state === "ready" && !feed.rows.length && <p className={styles.empty}>Belum ada ulasan terverifikasi untuk produk ini.</p>}
      {feed.rows.map(review => <article className={styles.review} key={review.id}><div className={styles.reviewTop}><div><strong>{review.author}</strong><Stars value={review.rating}/></div><time dateTime={review.created_at}>{dateLabel.format(new Date(review.created_at))}</time></div><p>{review.comment}</p></article>)}</div>
  </section>;
}

export function InvoiceReviewForm({ invoiceId, submitted: initialSubmitted = false }: { invoiceId: string; submitted?: boolean }) {
  const [rating, setRating] = useState(5), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(initialSubmitted), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || submitted) return; setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`${apiUrl}/catalog/reviews`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, rating, comment }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "Ulasan belum dapat dikirim.");
      setSubmitted(true); setMessage(data?.message || "Ulasan tersimpan dan menunggu peninjauan admin.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Ulasan belum dapat dikirim. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <section className={styles.invoiceReview} aria-labelledby="invoice-review-title"><h3 id="invoice-review-title">Beri rating pesanan ini</h3>{submitted ? <p role="status">Ulasan dari invoice ini sudah dikirim. Terima kasih!</p> : <form className={styles.form} method="post" action={apiUrl+"/catalog/reviews"} aria-labelledby="invoice-review-title" onSubmit={event => void submit(event)}><input type="hidden" name="invoiceId" value={invoiceId}/>
    <fieldset className={styles.starField}><legend>Rating produk</legend><div className={styles.starChoices}>{[1,2,3,4,5].map(value => <label key={value} className={`${styles.starChoice} ${value <= rating ? styles.starActive : ""}`}><input className={styles.starRadio} type="radio" name="invoice-rating" value={value} checked={rating === value} onChange={() => setRating(value)}/><Star size={23} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true"/><span className="sr-only">{value} bintang</span></label>)}</div><span className={styles.starHint}>{rating} dari 5 bintang</span></fieldset>
    <label className={styles.field} htmlFor="invoice-review-comment">Komentar<textarea id="invoice-review-comment" name="comment" autoComplete="off" required minLength={5} maxLength={1000} rows={4} value={comment} onChange={event => setComment(event.target.value)} placeholder="Ceritakan pengalamanmu"/><small>5–1.000 karakter. Jangan sertakan data pribadi atau kata sandi.</small></label>
    {message && <p className={failed?styles.error:styles.notice} role={failed?"alert":"status"}>{message}</p>}<button className={styles.submit} type="submit" disabled={busy}>{busy ? "Mengirim ulasan…" : "Kirim rating"}</button>
  </form>}</section>;
}
