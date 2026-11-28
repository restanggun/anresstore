export function supportInvoiceReference(value: unknown) {
  if (typeof value !== "string") return null;
  if (/^ANRS-(?:[0-9]{6}-[A-F0-9]{14}|[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16})$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  return null;
}
