import { adminDb } from "../admin/admin-store";

export const reviewInvoiceNameSelect = "payment:payments!invoices_payment_id_fkey(customer_name),premium:premium_orders!invoices_premium_order_id_fkey(admin_customer_name)";
export const reviewAuthorSelect = `reviewer_user_id,reviewer_email,invoice:invoices!product_reviews_invoice_id_fkey(${reviewInvoiceNameSelect})`;

export type ReviewInvoiceName = {
  payment: { customer_name: string | null } | null;
  premium: { admin_customer_name: string | null } | null;
};

export type ReviewAuthor = {
  reviewer_user_id: string | null;
  reviewer_email: string | null;
  invoice: ReviewInvoiceName | null;
};

function publicName(value: string | null | undefined) {
  const words = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  const [firstWord, ...rest] = words;
  if (!firstWord || words.some(word => !/^[\p{L}\p{M}'’.-]+$/u.test(word) || !/\p{L}/u.test(word))) return "";
  const first = Array.from(firstWord);
  const firstName = first.length > 24 ? first.slice(0, 24).join("") + "…" : firstWord;
  return [firstName, ...rest.slice(0, 2).map(word => word.replace(/^[^\p{L}]*(\p{L}).*$/u, "$1."))].join(" ");
}

function maskedEmail(value: string | null) {
  const [, mailbox, hostname, suffix] = value?.trim().match(/^([^@\s]+)@([a-z0-9-]+)(?:\.[a-z0-9-]+)*\.([a-z]{2,8})$/i) ?? [];
  if (!mailbox || !hostname || !suffix) return "";
  const maskPart = (part: string) => Array.from(part).length > 1 ? (part.match(/^[\p{L}\p{N}]/u)?.[0] ?? "") + "***" : "***";
  return `${maskPart(mailbox)}@${maskPart(hostname)}.${suffix.toLowerCase()}`;
}

export async function reviewAuthorFormatter(reviews: readonly ReviewAuthor[]) {
  const ids = [...new Set(reviews.flatMap(review => review.reviewer_user_id ? [review.reviewer_user_id] : []))];
  const lookups = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    lookups.push(adminDb<{ id: string; full_name: string }>("users", `?select=id,full_name&id=in.(${batch.join(",")})`));
  }
  const names = new Map((await Promise.all(lookups)).flat().map(user => [user.id, publicName(user.full_name)]));
  return (review: ReviewAuthor) => {
    const invoiceName = publicName(review.invoice?.payment?.customer_name) || publicName(review.invoice?.premium?.admin_customer_name);
    const name = review.reviewer_user_id
      ? names.get(review.reviewer_user_id) || invoiceName
      : invoiceName || "Pembeli tamu";
    // The review stores the invoice email for both account and guest purchases.
    const email = maskedEmail(review.reviewer_email);
    return name && email ? `${name} (${email})` : name || email || "Pelanggan";
  };
}
