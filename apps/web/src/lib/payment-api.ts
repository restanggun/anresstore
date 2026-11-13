import { apiUrl } from "./auth-api";

export class PaymentRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function paymentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}/payments/${path}`, { ...init, credentials: "include", cache: "no-store", signal: init.signal ?? AbortSignal.timeout(25000) });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "Pembayaran tidak dapat diproses. Periksa status sebelum mencoba lagi.";
      throw new PaymentRequestError(message, response.status);
    }
    if (!body || typeof body !== "object") throw new Error();
    return body as T;
  } catch (error) {
    if (error instanceof PaymentRequestError) throw error;
    throw new PaymentRequestError("Koneksi terputus atau melewati batas waktu. Periksa status permintaan; jangan membuat pembayaran baru.", 0);
  }
}

const prefix = "anres-payment-intent:";
export function forgetPaymentIntent(id: string) {
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix) && localStorage.getItem(key) === id) localStorage.removeItem(key);
}

/** Serializes session initialization and intent selection across tabs. The database is authoritative. */
export async function submitPayment<T extends { id: string }>(body: Record<string, string | number>, onReserved: (id: string) => void): Promise<T> {
  if (!navigator.locks) throw new PaymentRequestError("Browser ini belum mendukung checkout aman antar tab. Gunakan browser terbaru.", 0);
  return navigator.locks.request("anres-payment-checkout", async () => {
    const session = await paymentRequest<{ mode: "guest" | "account"; scope: string }>("session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!/^[a-f0-9]{64}$/.test(session.scope)) throw new Error("Sesi checkout tidak valid.");
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    const key = `${prefix}${session.scope}:${digest}`;
    const saved = localStorage.getItem(key);
    const id = saved && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(saved) ? saved : crypto.randomUUID();
    // Only a non-secret ID and hashed fingerprint persist in JavaScript storage.
    // A failed save stops checkout before any request to the gateway.
    localStorage.setItem(key, id);
    onReserved(id);
    const payment = await paymentRequest<T>("transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    localStorage.setItem(key, payment.id);
    onReserved(payment.id);
    return payment;
  });
}
