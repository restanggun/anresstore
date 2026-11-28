export const domains = {
  web: process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000",
  auth: process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3000",
  app: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

export function loginDestination() {
  const admin = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("app") === "admin" && admin) return admin;
  const invoice = loginSupportInvoice();
  if (invoice) return new URL(invoiceSupportHref(invoice), domains.web).href;
  if (isResellerReturn()) return new URL("/dashboard/reseller", domains.app).href;
  return `${domains.app.replace(/\/$/, "")}/dashboard`;
}

export function isResellerReturn() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("returnTo") === "reseller";
}

export function withResellerReturn(path: string) {
  return isResellerReturn() ? `${path}${path.includes("?") ? "&" : "?"}returnTo=reseller` : path;
}

export function supportInvoiceReference(value: unknown) {
  if (typeof value !== "string") return null;
  if (/^ANRS-(?:[0-9]{6}-[A-F0-9]{14}|[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16})$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  return null;
}

export function invoiceSupportHref(reference: unknown) {
  const invoice = supportInvoiceReference(reference);
  return invoice ? `/bantuan?invoice=${encodeURIComponent(invoice)}#support-inbox` : "/bantuan#support-inbox";
}

export function withSupportInvoice(path: string, reference: unknown) {
  const invoice = supportInvoiceReference(reference);
  return invoice ? `${path}?${new URLSearchParams({ supportInvoice: invoice })}` : path;
}

export function loginSupportInvoice() {
  return typeof window === "undefined" ? null :
    supportInvoiceReference(new URLSearchParams(window.location.search).get("supportInvoice"));
}
