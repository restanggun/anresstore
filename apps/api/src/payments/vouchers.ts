import { HttpException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { CatalogItem } from "../catalog/catalog-mapping";
import { PaymentStore } from "./payment-store";

const voucherCategories = ["game", "prepaid", "apps", "social", "tasks"] as const;
type VoucherCategory = (typeof voucherCategories)[number];
type VoucherTarget = { category: VoucherCategory; product_slug: string; variant_code: string | null };
export const voucherUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const variantPattern = /^[A-Za-z0-9._-]{1,100}$/;
const codePattern = /^[A-Z0-9][A-Z0-9_-]{7,63}$/;
export type VoucherReference = { code: string } | { id: string };
type Source = CatalogItem["category"];
type PresentedProduct = CatalogItem & { promotion?: { startsAt: string; endsAt: string } | null };
export type VoucherOffer = { id: string; name: string; kind: "percent" | "fixed" | "gift"; baseAmount: number; discount: number; amount: number; endsAt: string };

export function parseVoucher(input: unknown): VoucherReference {
  const data = input as Record<string, unknown> | null;
  if (data && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 1) {
    if (typeof data.code === "string" && data.code.length <= 80) {
      const code = data.code.trim().toUpperCase();
      if (codePattern.test(code) && /^[\x20-\x7E]+$/.test(data.code)) return { code };
    }
    if (typeof data.id === "string" && voucherUuid.test(data.id)) return { id: data.id };
  }
  throw new HttpException("Kode atau voucher akun tidak valid.", 400);
}

export async function voucherBaseAmount(store: PaymentStore, product: CatalogItem, source: Source, input: {
  expectedQuantity?: unknown; task?: { pages?: unknown; deadline_days?: unknown; revisions?: unknown; pricing_unit?: unknown };
}) {
  let amount = product.price;
  if (source === "social") {
    const min = product.minimum ?? product.serviceQuantity ?? 1;
    const max = Math.min(product.maximum ?? product.serviceQuantity ?? 1, 10000000);
    const quantity = Number(input.expectedQuantity);
    if (!Number.isSafeInteger(input.expectedQuantity) || quantity < min || quantity > max)
      throw new HttpException("Jumlah item di luar batas layanan.", 400);
    amount = Math.ceil((product.unitPrice ?? product.price) * quantity / 1000);
  }
  if (source === "tasks") {
    const task = input.task;
    const unit = product.taskPricing?.unit ?? "page";
    if (!task || unit === "custom" || unit !== (task.pricing_unit ?? "page") ||
      !integerBetween(task.pages, 1, 500) || !integerBetween(task.deadline_days, 1, 90) ||
      !integerBetween(task.revisions, 0, 20) || !/^managed\.[a-f0-9-]{36}$/.test(product.code))
      throw new HttpException("Pilihan harga tugas tidak valid.", 400);
    amount = await store.rpc<number>("quote_task_order", { p_product: product.code.slice(8),
      p_pages: task.pages, p_days: task.deadline_days, p_revisions: task.revisions });
  }
  if (!integerBetween(amount, 1, 100000000)) throw new HttpException("Harga produk belum tersedia.", 409);
  return amount;
}

export function promotedProduct(product: PresentedProduct) {
  const promotion = product.promotion;
  return !!promotion && Date.parse(promotion.startsAt) <= Date.now() && Date.parse(promotion.endsAt) > Date.now();
}

export async function quoteVoucher(store: PaymentStore, voucher: VoucherReference, product: PresentedProduct,
  baseAmount: number, userId: string | null, mode: "live" | "sandbox") {
  try {
    return await store.rpc<VoucherOffer>("voucher_offer", { p_voucher: voucher, p_context: {
      user_id: userId, source: product.category, product_slug: product.productSlug, code: product.code,
      base_amount: baseAmount, mode, promoted: promotedProduct(product),
    } });
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === 409)
      throw new HttpException("Voucher tidak tersedia untuk pesanan ini. Periksa ketentuan atau masuk ke akun.", 409);
    throw error;
  }
}

function integerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

export function isVoucherCategory(value: unknown): value is VoucherCategory {
  return voucherCategories.some(category => category === value);
}

function isProductSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function parseVoucherTargets(input: unknown, category: VoucherCategory | null): VoucherTarget[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new HttpException("Daftar produk atau varian voucher tidak valid.", 400);
  }
  const targets = new Map<string, VoucherTarget>();
  for (const row of input) {
    const target = row as Record<string, unknown> | null;
    const source = target?.category;
    const product = target?.product_slug;
    const variant = target?.variant_code;
    if (!isVoucherCategory(source) || (category !== null && category !== source) || !isProductSlug(product) ||
      (variant !== null && (typeof variant !== "string" || !variantPattern.test(variant)))) {
      throw new HttpException("Produk atau varian target voucher tidak valid.", 400);
    }
    const value = { category: source, product_slug: product, variant_code: variant };
    targets.set(JSON.stringify(value), value);
  }
  return [...targets.values()];
}

export function parseVoucherSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpException("Pengaturan voucher tidak valid.", 400);
  const data = input as Record<string, unknown>;
  function invalid(message: string): never {
    throw new HttpException(message, 400);
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || name.length > 100) invalid("Isi nama voucher, maksimal 100 karakter.");
  const kind = data.kind;
  if (kind !== "percent" && kind !== "fixed" && kind !== "gift") invalid("Pilih jenis voucher.");
  const code = data.code === "" ? "ANRES-" + randomBytes(12).toString("hex").toUpperCase()
    : data.code === null ? null : (parseVoucher({ code: data.code }) as { code: string }).code;
  const category = data.category ?? null, product_slug = data.product_slug ?? null, variant_code = data.variant_code ?? null;
  if (category !== null && !isVoucherCategory(category)) invalid("Kategori tidak valid.");
  if (product_slug !== null && (!category || !isProductSlug(product_slug))) invalid("Produk tidak valid.");
  if (variant_code !== null && (!product_slug || typeof variant_code !== "string" || !variantPattern.test(variant_code))) invalid("Varian tidak valid.");
  const targets = parseVoucherTargets(data.targets, category);
  if (targets.length && product_slug !== null) invalid("Simpan produk dan varian dalam satu daftar target.");
  const date = (value: unknown) => {
    if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    const day = value.slice(0, 10);
    const midnight = new Date(day + "T00:00:00Z");
    return Number.isFinite(midnight.getTime()) && midnight.toISOString().startsWith(day) ? Date.parse(value) : NaN;
  };
  const start = date(data.starts_at), end = date(data.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) invalid("Tanggal berakhir harus setelah tanggal mulai. Sertakan zona waktu.");
  const value = kind === "gift" ? 1 : data.value;
  const cap = kind === "fixed" ? null : data.discount_cap ?? null;
  const minimum = data.minimum_amount ?? 0;
  const total = data.total_limit, perAccount = data.account_limit ?? null;
  if (!integerBetween(value, 1, kind === "percent" ? 99 : 100000000) ||
    (cap !== null && !integerBetween(cap, 1, 100000000)) || !integerBetween(minimum, 0, 100000000) ||
    !integerBetween(total, 1, 1000000) || (perAccount !== null && !integerBetween(perAccount, 1, Number(total))))
    invalid("Periksa nominal, kuota total, dan batas per akun.");
  const giftTargets = targets.length
    ? targets.every(target => target.variant_code && ["game", "prepaid", "apps"].includes(target.category))
    : variant_code !== null && ["game", "prepaid", "apps"].includes(String(category));
  if (kind === "gift" && (!giftTargets || cap === null || perAccount === null))
    invalid("Hadiah perlu varian game, PPOB, atau aplikasi premium, nilai produk maksimum, dan batas per akun.");
  if (typeof data.allow_promotion !== "boolean" || typeof data.active !== "boolean") invalid("Pengaturan status voucher tidak valid.");
  return { name, code, kind, value, discount_cap: cap, minimum_amount: minimum, category, product_slug, variant_code, targets,
    starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), total_limit: total,
    account_limit: perAccount, allow_promotion: data.allow_promotion, active: data.active };
}
