"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Share2, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/auth-api";
import { useCheckoutEmail } from "./use-checkout-email";
import styles from "./product-reviews.module.css";

export type ReviewCategory = "game" | "prepaid" | "apps" | "social" | "tasks";
type Review = { id: string; rating: number; comment: string; author: string; created_at: string };
type ReviewFeed = { summary: { review_count: number; average_rating: number }; rows: Review[] };

export function ShareProductLink({ categorySlug, productSlug, productName }: {
  categorySlug: string; productSlug: string; productName: string;
}) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function share() {
    const url = new URL(`/katalog/${categorySlug}/${productSlug}`, window.location.origin).toString();
    const data = { title: `${productName} | Anres Store`, text: `Lihat ${productName} di Anres Store`, url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        setStatus("Tautan produk berhasil dibagikan.");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard tidak tersedia");
      await navigator.clipboard.writeText(url);
      setStatus("Tautan produk disalin.");
    } catch {
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const field = document.createElement("textarea");
      field.value = url;
      field.readOnly = true;
      field.tabIndex = -1;
      field.setAttribute("aria-hidden", "true");
      field.style.position = "fixed";
      field.style.insetInlineStart = "-9999px";
      document.body.append(field);
      let copied = false;
      try { field.select(); copied = document.execCommand("copy"); }
      catch { copied = false; }
      finally { field.remove(); previous?.focus(); }
      setStatus(copied ? "Tautan produk disalin." : "Tautan belum tersalin. Coba lagi dari browser yang mendukung clipboard.");
    }
  }

  return <div className={styles.shareWrap}>
    <button className={styles.shareButton} type="button" onClick={() => void share()}>
      <Share2 size={16} aria-hidden="true" />Bagikan tautan
    </button>
    {status && <span className={styles.shareStatus} role="status" aria-live="polite">{status}</span>}
  </div>;
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const reduce = useReducedMotion();
  return <fieldset className={styles.starField}>
    <legend>Rating produk</legend>
    <div className={styles.starChoices}>
      {[1, 2, 3, 4, 5].map(star => <label key={star} className={`${styles.starChoice} ${star <= value ? styles.starActive : ""}`}>
        <input className={styles.starRadio} type="radio" name="rating" value={star} checked={value === star}
          onChange={() => onChange(star)} aria-label={`${star} bintang`} />
        <motion.span aria-hidden="true" animate={{ scale: value === star ? 1.12 : 1 }}
          transition={{ duration: reduce ? 0 : 0.14, ease: [0.2, 0, 0, 1] }}>
          <Star size={25} strokeWidth={1.8} fill={star <= value ? "currentColor" : "none"} />
        </motion.span>
      </label>)}
    </div>
    <span className={styles.starHint}>{value} dari 5 bintang</span>
  </fieldset>;
}

function Stars({ value }: { value: number }) {
  const rating = Math.round(value);
  return <span className={styles.reviewStars} aria-label={`${value} dari 5 bintang`}>
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} aria-hidden="true"
      fill={index < rating ? "currentColor" : "none"} />)}
  </span>;
}

export function ProductReviews({ category, productSlug, productName, enabled = true }: {
  category: ReviewCategory; productSlug: string; productName: string; enabled?: boolean;
}) {
  const { accountEmail, loading: emailLoading } = useCheckoutEmail();
  const [feed, setFeed] = useState<ReviewFeed>({ summary: { review_count: 0, average_rating: 0 }, rows: [] });
  const [feedState, setFeedState] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [reload, setReload] = useState(0);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setFeedState("loading");
    fetch(`${apiUrl}/catalog/reviews/${encodeURIComponent(category)}/${encodeURIComponent(productSlug)}`,
      { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Ulasan belum dapat dimuat.");
        if (!data || !Array.isArray(data.rows) || !data.summary || !Number.isSafeInteger(data.summary.review_count))
          throw new Error("Data ulasan tidak valid.");
        if (!controller.signal.aborted) { setFeed(data as ReviewFeed); setFeedState("ready"); }
      })
      .catch(cause => { if (!controller.signal.aborted) { setFeedState("error"); setFeedError(cause instanceof Error ? cause.message : "Ulasan belum dapat dimuat."); } });
    return () => controller.abort();
  }, [category, enabled, productSlug, reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !enabled) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiUrl}/catalog/reviews`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, productSlug, rating, comment, ...(accountEmail ? {} : { email }),
          website: (new FormData(event.currentTarget).get("website") || "").toString() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "Ulasan belum dapat dikirim. Coba lagi.");
      setNotice(typeof data?.message === "string" ? data.message : "Ulasan tersimpan dan menunggu peninjauan admin.");
      setComment(""); setRating(5); setEmail(""); setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ulasan belum dapat dikirim. Coba lagi."); }
    finally { setBusy(false); }
  }

  return <section className={styles.reviews} id="product-reviews" aria-labelledby="product-reviews-title">
    <div className={styles.heading}>
      <div><span className={styles.kicker}>Pendapat pelanggan</span><h2 id="product-reviews-title">Rating & ulasan {productName || productSlug.replace(/-/g, " ") || "produk"}</h2>
        <p>Ulasan yang lolos peninjauan akan tampil di halaman produk.</p></div>
      <div className={styles.summary} aria-label={feed.summary.review_count
        ? `Rata-rata ${feed.summary.average_rating} dari 5 bintang, ${feed.summary.review_count} ulasan`
        : "Belum ada ulasan"}>
        <strong>{feed.summary.review_count ? feed.summary.average_rating.toFixed(1) : "—"}</strong>
        <Stars value={feed.summary.average_rating} />
        <span>{feed.summary.review_count} ulasan</span>
      </div>
    </div>

    <form className={styles.form} method="post" action={`${apiUrl}/catalog/reviews`}
      onSubmit={event => void submit(event)} aria-labelledby="product-reviews-title">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="productSlug" value={productSlug} />
      <StarPicker value={rating} onChange={setRating} />
      <label className={styles.field} htmlFor="reviewer-email">
        {accountEmail ? "Email akun terverifikasi" : "Email"}
        <Input id="reviewer-email" name="email" type="email" autoComplete="email" maxLength={254}
          required={!accountEmail} readOnly={!!accountEmail} disabled={emailLoading}
          autoCapitalize="none" spellCheck={false} aria-describedby="reviewer-email-help"
          value={accountEmail ?? email} onChange={event => setEmail(event.target.value)}
          placeholder={accountEmail ? undefined : "nama@email.com"} />
        <small id="reviewer-email-help">{accountEmail ? "Ulasan ini terhubung ke email akun yang sedang masuk." : "Email hanya dipakai admin untuk mengelola ulasan dan tidak ditampilkan publik."}</small>
      </label>
      <label className={styles.field} htmlFor="review-comment">Komentar
        <textarea id="review-comment" name="comment" required minLength={5} maxLength={1000} rows={4}
          value={comment} onChange={event => setComment(event.target.value)} aria-describedby="review-comment-help" />
        <small id="review-comment-help">5–1.000 karakter. Tulis pengalamanmu tanpa data pribadi atau kata sandi.</small>
      </label>
      <label className={styles.honeypot} aria-hidden="true">Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {error && feedState !== "error" && <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <button className={styles.submit} type="submit" disabled={busy || emailLoading || !enabled}>
        {busy ? "Mengirim ulasan…" : "Kirim ulasan"}
      </button>
    </form>

    <div className={styles.reviewList}>
      {feedState === "loading" && <p>Memuat ulasan…</p>}
      {feedState === "error" && <div className={styles.error} role="alert">{feedError}<button type="button" onClick={() => { setFeedError(""); setReload(value => value + 1); }}>Coba lagi</button></div>}
      {feedState === "ready" && !feed.rows.length && <p className={styles.empty}>Belum ada ulasan yang tampil. Jadilah yang pertama berbagi pengalaman.</p>}
      {feed.rows.map(review => <article className={styles.review} key={review.id}>
        <div className={styles.reviewTop}><div><strong>{review.author}</strong><Stars value={review.rating} /></div>
          <time dateTime={review.created_at}>{dateLabel.format(new Date(review.created_at))}</time></div>
        <p>{review.comment}</p>
      </article>)}
    </div>
  </section>;
}
