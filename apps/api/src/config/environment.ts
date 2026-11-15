import { isIP } from "node:net";

export function readEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT harus integer 1–65535.");
  const origins = (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => {
    try { const parsed = new URL(origin); return !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin; }
    catch { return true; }
  })) throw new Error("CORS_ORIGINS harus berisi origin HTTP/HTTPS eksplisit, dipisahkan koma.");
  const trustedProxies = (env.TRUST_PROXY_CIDRS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (trustedProxies.some(value => {
    const [address, prefix, extra] = value.split("/");
    const version = isIP(address ?? "");
    return !version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)));
  })) throw new Error("TRUST_PROXY_CIDRS hanya menerima IP/CIDR proxy yang dipercaya; wildcard tidak diizinkan.");
  if (env.NODE_ENV === "production" && (origins.some(origin => !origin.startsWith("https://")) ||
      !env.AUTH_WEB_ORIGIN?.startsWith("https://") || !env.AUTH_API_ORIGIN?.startsWith("https://"))) {
    throw new Error("Production memerlukan origin web/API HTTPS eksplisit.");
  }
  if (env.NODE_ENV === "production") {
    validateProductionPayments(env);
    for (const name of ["AUTH_WEB_ORIGIN", "AUTH_AUTH_ORIGIN", "AUTH_APP_ORIGIN", "AUTH_API_ORIGIN", "AUTH_ADMIN_ORIGIN"] as const) {
      const value = env[name];
      try {
        const parsed = new URL(value || "");
        if (parsed.protocol !== "https:" || parsed.origin !== value) throw new Error();
        if (name !== "AUTH_API_ORIGIN" && !origins.includes(value!)) throw new Error();
      } catch { throw new Error(`${name} harus origin HTTPS eksplisit dan frontend wajib terdaftar di CORS_ORIGINS.`); }
    }
    if (!(env.ADMIN_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).includes(env.AUTH_ADMIN_ORIGIN!)) {
      throw new Error("AUTH_ADMIN_ORIGIN harus terdaftar di ADMIN_ALLOWED_ORIGINS.");
    }
  }
  return { port, origins, trustedProxies };
}

/** Validate before opening the HTTP listener; never print credential values. */
export function validateProductionPayments(env: NodeJS.ProcessEnv) {
  const mode = env.TRIPAY_MODE;
  if (mode !== "live") throw new Error("Production memerlukan TRIPAY_MODE=live.");
  const expected = "https://tripay.co.id/api";
  if (env.TRIPAY_BASE_URL !== expected) throw new Error("TRIPAY_BASE_URL tidak sesuai mode.");
  for (const name of ["TRIPAY_API_KEY", "TRIPAY_PRIVATE_KEY", "TRIPAY_MERCHANT_CODE", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const) {
    if (!env[name]?.trim()) throw new Error(`${name} wajib diisi.`);
  }
  if (env.TRIPAY_CALLBACK_URL !== `${env.AUTH_API_ORIGIN}/v1/payments/callback`) throw new Error("Callback pembayaran harus menggunakan origin API produksi.");
  try {
    const url = new URL(env.TRIPAY_RETURN_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
        ![env.AUTH_WEB_ORIGIN, env.AUTH_APP_ORIGIN].includes(url.origin)) throw new Error();
  } catch { throw new Error("TRIPAY_RETURN_URL harus mengarah ke storefront HTTPS yang dipercaya."); }
  if (env.PAYMENT_RECONCILIATION_ENABLED !== "true") throw new Error("Rekonsiliasi pembayaran wajib aktif di production.");
  if (mode === "live") {
    // false is an operational purchase pause; already submitted orders must still be polled.
    if (!["true", "false"].includes(env.VIPAYMENT_FULFILLMENT_ENABLED || "")) throw new Error("Status pengiriman VIPayment harus eksplisit.");
    if (env.VIPAYMENT_STATUS_POLLING_ENABLED !== "true") throw new Error("Polling VIPayment wajib aktif untuk transaksi live.");
    for (const name of ["VIPAYMENT_API_ID", "VIPAYMENT_API_KEY"] as const) {
      if (!env[name]?.trim()) throw new Error(`${name} wajib diisi untuk transaksi live.`);
    }
  }
}
