import { manualQrisImage } from "../payments/manual-qris";
import { HttpException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { adminDb } from "./admin-store";
import { premiumImage } from "../payments/premium-orders.controller";
import { PaymentStore } from "../payments/payment-store";

const categories = ["game", "prepaid", "apps", "social", "tasks"];
const version = /^\d{4}-\d{2}-\d{2}T/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const store = new PaymentStore();

function text(value: unknown, length: number, label: string, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.length > length || (required && !value.trim()))
    throw new HttpException(`${label} tidak valid.`, 400);
  return value.trim() || null;
}

const byId = (id: string) => `?id=eq.${id}&archived_at=is.null&payment_mode=eq.live`;

export async function invoiceManagement(id: string) {
  const [invoice] = await adminDb<{
    order_kind: "premium" | "payment"; updated_at: string; payment_status: string;
    fulfillment_status: string; product_slug: string | null; customer_email: string | null; amount: number;
  }>("invoices", byId(id) + "&select=order_kind,updated_at,payment_status,fulfillment_status,product_slug,customer_email,amount");
  if (!invoice) throw new HttpException("Invoice tidak ditemukan.", 404);
  const [details, reviews, tasks] = await Promise.all([
    invoice.order_kind === "premium"
      ? adminDb<{ status?: string; method?: string; voucher_applied?: boolean }>("premium_orders", byId(id) + "&select=status,voucher_applied")
      : adminDb<{ status?: string; method?: string; voucher_applied?: boolean }>("payments", byId(id) + "&select=status,method"),
    adminDb<{ id: string }>("product_reviews", `?invoice_id=eq.${id}&select=id`),
    adminDb<{ workflow_status: string }>("task_order_specs", `?payment_id=eq.${id}&select=workflow_status`),
  ]);
  const current = details[0];
  if (!current) throw new HttpException("Invoice tidak ditemukan.", 404);
  const premium = invoice.order_kind === "premium";
  const manual = current.method === "MANUAL_QRIS";
  const status = current.status ?? "";
  const task = tasks[0];
  const hasProof = await hasInvoiceProof(id, premium);
  return {
    version: invoice.updated_at, premium, manual,
    canEditAmount: premium ? status === "awaiting_qr" && !current.voucher_applied : manual && status === "pending" && !hasProof,
    canEditTarget: !premium && !task && ["not_ready", "ready"].includes(invoice.fulfillment_status),
    canUpload: !premium || ["awaiting_qr", "awaiting_payment", "proof_submitted"].includes(status),
    hasProof,
    canRestore: premium ? status === "cancelled" : manual && ["failed", "expired"].includes(status),
    canShare: invoice.payment_status === "paid" && invoice.fulfillment_status === "completed" &&
      Number(invoice.amount) > 0 && !!invoice.product_slug && !!invoice.customer_email && !reviews.length &&
      (!task || task.workflow_status === "completed"),
    reviewed: reviews.length > 0,
    paymentOptions: premium ? {
      awaiting_qr: ["cancelled"], awaiting_payment: ["cancelled"],
      proof_submitted: ["paid", "cancelled"], paid: ["delivered"], delivered: ["closed"],
    }[status] ?? [] : manual ? status === "pending" ? [...(hasProof ? ["paid"] : []), "failed"] : status === "paid" ? ["refunded"] : [] : [],
    canArchive: premium ? ["cancelled", "delivered", "closed"].includes(status) :
      ["failed", "expired", "refunded"].includes(status) ||
      (status === "paid" && ["completed", "failed"].includes(invoice.fulfillment_status) && (!task || task.workflow_status === "completed")),
  };
}

async function hasInvoiceProof(id: string, premium: boolean) {
  if (premium) return (await adminDb("premium_orders", byId(id) + "&proof_image=not.is.null&select=id")).length > 0;
  return (await adminDb("invoice_admin_evidence", `?invoice_id=eq.${id}&select=invoice_id`)).length > 0;
}

export async function invoiceProof(id: string) {
  const [invoice] = await adminDb<{ order_kind: string }>("invoices", byId(id) + "&select=order_kind");
  if (!invoice) throw new HttpException("Invoice tidak ditemukan.", 404);
  const [proof] = await adminDb<{ proof_image: string | null; proof_note: string | null }>(
    invoice.order_kind === "premium" ? "premium_orders" : "invoice_admin_evidence",
    (invoice.order_kind === "premium" ? byId(id) : `?invoice_id=eq.${id}`) + "&select=proof_image,proof_note",
  );
  return { image: proof?.proof_image ?? null, note: proof?.proof_note ?? null };
}

export async function manageInvoice(actor: string, id: string, action: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpException("Data invoice tidak valid.", 400);
  const body = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  let token: string | undefined;
  if (["edit", "status", "restore", "archive"].includes(action)) {
    if (typeof body.version !== "string" || !version.test(body.version) || !Number.isFinite(Date.parse(body.version)))
      throw new HttpException("Muat ulang detail invoice sebelum melanjutkan.", 400);
    data.version = body.version;
  }
  switch (action) {
    case "create":
    case "edit": {
      data.productName = text(body.productName, 180, "Nama produk", true);
      data.name = text(body.name, 100, "Nama pelanggan");
      data.email = text(body.email, 254, "Email pelanggan", action === "create")?.toLowerCase() ?? null;
      data.phone = text(body.phone, 16, "Nomor WhatsApp");
      if (typeof data.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        throw new HttpException("Email pelanggan tidak valid.", 400);
      if (body.target !== undefined || action === "create") {
        data.target = text(body.target, 1000, "Tujuan layanan", true);
        data.targetZone = text(body.targetZone, 80, "Server atau zona");
      }
      if (body.amount !== undefined || action === "create") {
        if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 100000000)
          throw new HttpException("Nominal harus antara Rp1 dan Rp100.000.000.", 400);
        data.amount = body.amount;
      }
      if (action === "create") {
        if (typeof body.category !== "string" || !categories.includes(body.category)) throw new HttpException("Kategori tidak valid.", 400);
        const productSlug = text(body.productSlug, 100, "Slug produk");
        if (productSlug && !slug.test(productSlug)) throw new HttpException("Gunakan slug produk seperti mobile-legends.", 400);
        data.category = body.category;
        data.productSlug = productSlug;
        data.identityHash = createHash("sha256").update(JSON.stringify([actor, id, data])).digest("hex");
      }
      break;
    }
    case "proof":
      data.image = premiumImage(body.image, 10 * 1024 * 1024);
      data.note = text(body.note, 500, "Catatan bukti");
      break;
    case "status":
      if (!["payment", "fulfillment"].includes(String(body.field)) ||
          !["paid", "failed", "refunded", "ready", "processing", "completed", "delivered", "closed", "cancelled"].includes(String(body.status)))
        throw new HttpException("Status tidak valid.", 400);
      data.field = body.field;
      data.status = body.status;
      data.note = text(body.note, 2000, "Catatan pengerjaan");
      break;
    case "restore":
    case "archive":
      if (body.confirm !== true) throw new HttpException("Konfirmasi tindakan terlebih dahulu.", 400);
      if (action === "restore") {
        const [premium] = await adminDb<{ amount: number }>("premium_orders", byId(id) + "&status=eq.cancelled&qr_image=is.null&proof_image=is.null&select=amount");
        if (premium) data.newQr = await manualQrisImage(Number(premium.amount));
      }
      break;
    case "share":
      token = randomBytes(32).toString("base64url");
      data.tokenHash = reviewTokenHash(token);
      break;
    default:
      throw new HttpException("Aksi invoice tidak ditemukan.", 404);
  }
  try {
    const [result] = await store.request<{ invoice_id: string; invoice_number: string }[]>(
      "rpc/admin_manage_invoice", "POST", { p_actor: actor, p_id: id, p_action: action, p_data: data },
    );
    if (!result) throw new HttpException("Invoice belum dapat disimpan.", 503);
    return { id: result.invoice_id, invoiceNumber: result.invoice_number, ...(token ? { token } : {}) };
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === 409)
      throw new HttpException("Invoice berubah atau aksi ini sudah tidak tersedia. Muat ulang detail dan coba lagi.", 409);
    throw error;
  }
}

export function reviewTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
