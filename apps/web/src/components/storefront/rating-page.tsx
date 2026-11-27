"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@anres/ui";
import { apiUrl } from "@/lib/auth-api";
import { InvoiceReviewForm } from "./product-reviews";
import styles from "./product-reviews.module.css";

type LinkedInvoice = { invoiceNumber: string; productName: string; submitted: boolean; author?: string };

export function RatingPage() {
  const [token, setToken] = useState("");
  const [invoice, setInvoice] = useState<LinkedInvoice>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const link = window.location.hash.slice(1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(link)) {
      setError("Buka tautan rating yang kamu terima dari Anres Store.");
      return;
    }
    const controller = new AbortController();
    setToken(link);
    setError("");
    fetch(`${apiUrl}/catalog/reviews/link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link }), cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Tautan rating belum dapat dibuka.");
      setInvoice(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message || "Tautan rating belum dapat dibuka.");
    });
    return () => controller.abort();
  }, [attempt]);

  return <main id="main" className={`container ${styles.ratingPage}`}>
      <header>
        <h1>Rating pesanan</h1>
        {invoice && <><p>{invoice.productName}</p><small>{invoice.invoiceNumber}</small></>}
      </header>
      {invoice ? <InvoiceReviewForm reviewToken={token} author={invoice.author} submitted={invoice.submitted} /> :
        error ? <div className={styles.ratingPageFeedback}>
          <p role="alert">{error}</p>
          {token ? <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Coba lagi</Button> :
            <Button asChild variant="outline"><Link href="/bantuan">Pusat bantuan</Link></Button>}
        </div> : <p role="status">Memuat rating pesanan…</p>}
  </main>;
}
