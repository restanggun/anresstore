import { apiUrl } from "./auth-api";

export type ResellerSnapshot = {
  registrationOpen: boolean;
  hostedEnabled: boolean;
  member: { shop_name: string; status: "pending" | "approved" | "rejected" | "suspended" } | null;
  progress: { retailSpend: number; retailTier: "reguler" | "perak" | "emas"; volume: number; activationSpend: number; activated: boolean; tier: "starter" | "pro" | "partner" };
};

export class ResellerRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function resellerRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiUrl}/reseller/${path}`, {
    credentials: "include", cache: "no-store", method: body === undefined ? "GET" : "POST",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ResellerRequestError(
    typeof data?.message === "string" ? data.message : "Layanan reseller belum dapat dimuat.", response.status);
  return data as T;
}

export const resellerRupiah = (amount: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(amount);
