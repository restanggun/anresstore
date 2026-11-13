import { HttpException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentIdentity } from "./payment-identity";
import type { PaymentStatus } from "./transaction-state";
import type { TripayTransaction } from "./tripay-client";

export const paymentId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const paymentHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type PaymentRow = {
  id: string; access_hash: string; request_hash: string; created_at: string;
  source: string; product_name: string; provider_code: string; target: string;
  amount: number; method: string; reference: string | null; status: PaymentStatus; details: TripayTransaction | null;
  owner_user_id: string | null; guest_session_hash: string | null; checkout_hash: string | null;
  revision: number; provider_checked_at: string | null; provider_check_until: string | null; review_required: boolean;
};
export type PaymentInput = { id: string; source: string; code: string; target: string; method: string; name: string; email: string; phone: string; expectedAmount: number };

export function parsePayment(input: unknown): PaymentInput {
  const invalid = () => new HttpException("Data pembayaran tidak valid. Muat ulang checkout dan periksa isian.", 400);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  const body = input as Record<string, unknown>;
  const fields = ["id", "source", "code", "target", "method", "name", "email", "phone"] as const;
  const allowed: readonly string[] = [...fields, "expectedAmount"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw invalid();
  const values: Record<string, string> = {};
  for (const key of fields) {
    if (typeof body[key] !== "string" || body[key].length > 254 || /[\u0000-\u001f\u007f]/u.test(body[key])) throw invalid();
    const value = body[key].normalize("NFC").trim().replace(/\s+/g, " ");
    if (!value) throw invalid();
    values[key] = value;
  }
  const result = { ...values, id: values.id!.toLowerCase(), email: values.email!.toLowerCase(), expectedAmount: body.expectedAmount } as PaymentInput;
  if (!paymentId.test(result.id) || !["game", "prepaid", "apps"].includes(result.source) ||
      result.code.length > 100 || result.target.length > 200 || result.name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) || !/^\+?\d{8,15}$/.test(result.phone) ||
      !/^[A-Z0-9_]{1,50}$/.test(result.method) || !Number.isSafeInteger(result.expectedAmount) || result.expectedAmount < 1 || result.expectedAmount > 100000000) throw invalid();
  return result;
}

export function ownsPayment(row: PaymentRow, identity: PaymentIdentity, legacyHash: string | null): boolean {
  if (row.owner_user_id) return identity.userId === row.owner_user_id;
  const age = Date.now() - Date.parse(row.created_at);
  if (!Number.isFinite(age) || age < -60000) return false;
  if (row.guest_session_hash) return age <= 30 * 86400000 && identity.guestHash !== null && equalHash(identity.guestHash, row.guest_session_hash);
  return age <= 7 * 86400000 && legacyHash !== null && equalHash(legacyHash, row.access_hash);
}
function equalHash(a: string, b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function validatePaymentDetail(row: PaymentRow, detail: TripayTransaction) {
  let checkout: URL;
  try { checkout = new URL(detail.checkout_url); } catch { throw new HttpException("Detail pembayaran tidak valid.", 502); }
  const items = detail.order_items;
  if (!Array.isArray(items) || items.length !== 1 || items.some(item => !Number.isSafeInteger(item.price) || item.price <= 0 || item.quantity !== 1 || item.sku !== row.provider_code) || items[0]!.price !== row.amount ||
      detail.merchant_ref !== row.id || detail.payment_method !== row.method ||
      !Number.isSafeInteger(detail.amount) || detail.amount < row.amount || detail.amount > 100000000 ||
      !Number.isSafeInteger(detail.fee_customer) || detail.fee_customer < 0 || detail.amount !== row.amount + detail.fee_customer ||
      typeof detail.reference !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(detail.reference) ||
      (row.reference !== null && row.reference !== detail.reference) || checkout.protocol !== "https:" || checkout.hostname !== "tripay.co.id" || checkout.username || checkout.password || checkout.port ||
      checkout.pathname !== `/checkout/${detail.reference}` || checkout.search || checkout.hash ||
      !Number.isSafeInteger(detail.expired_time) || detail.expired_time <= 0 ||
      typeof detail.payment_name !== "string" || detail.payment_name.length > 100 ||
      (detail.pay_code !== null && (typeof detail.pay_code !== "string" || detail.pay_code.length > 200)) ||
      !["UNPAID", "PAID", "FAILED", "EXPIRED", "REFUND"].includes(detail.status)) throw new HttpException("Detail pembayaran tidak cocok dengan pesanan.", 502);
}
