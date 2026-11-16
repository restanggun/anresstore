type NavigablePayment = { id: string; status: string; needsReview: boolean; checkoutUrl: string | null };

export function invoicePath(id: string, invoiceNumber?: string | null) {
  const code = invoiceNumber ?? id;
  if (!/^ANRS-(?:[0-9]{6}-[A-F0-9]{14}|[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16})$/.test(code) && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(code)) throw new Error("Nomor invoice tidak valid.");
  return `/invoice/${code}`;
}

/** Keep recovery and terminal payments on their invoice; only pay a verified pending intent. */
export function tripayCheckoutUrl(payment: NavigablePayment): string | null {
  if (payment.status !== "pending" || payment.needsReview || !payment.checkoutUrl) return null;
  try {
    const url = new URL(payment.checkoutUrl);
    if (url.protocol !== "https:" || url.hostname !== "tripay.co.id" || url.username || url.password || url.port || url.search || url.hash || !/^\/checkout\/[A-Za-z0-9-]{1,100}$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
