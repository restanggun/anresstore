import type { Request, Response, NextFunction } from "express";
import { PaymentStore } from "../payments/payment-store";
import { paymentHash } from "../payments/payment-contract";

/** Shared abuse budgets for auth/OTP, support, and authenticated write surfaces. */
export function apiAbuseMiddleware(store = new PaymentStore()) {
  const coarse = new Map<string, { count: number; until: number }>();
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/\/+$/, "").toLowerCase();
    const sensitive = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && /^\/v1\/(auth|help|admin)\//.test(path);
    const oauth = req.method === "GET" && path === "/v1/auth/google";
    if (!sensitive && !oauth) { next(); return; }
    const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001").split(",").map(value => value.trim());
    if (sensitive && (!req.headers.origin || !origins.includes(req.headers.origin))) { res.status(403).json({ message: "Origin tidak diizinkan." }); return; }
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    for (const [key, value] of coarse) if (value.until <= now) coarse.delete(key);
    const current = coarse.get(ip) ?? { count: 0, until: now + 60000 };
    if (current.count >= 180 || coarse.size >= 10000) { res.setHeader("Retry-After", "60"); res.status(429).json({ message: "Terlalu banyak permintaan. Coba sebentar lagi." }); return; }
    current.count++; coarse.set(ip, current);
    const emailAction = /\/(recover|send-login-code|resend-signup|register)$/.test(path);
    const login = /\/(login|verify-login-code|confirm-signup|reset-password|check-email)$/.test(path);
    const limit = emailAction ? 5 : login || oauth ? 20 : path.startsWith("/v1/help/") ? 10 : 60;
    const seconds = emailAction ? 900 : 60;
    try {
      const general = await store.rpc<boolean>("consume_payment_rate", { p_key: `api-ip:${paymentHash(ip)}`, p_limit: 120, p_seconds: 60 });
      if (general !== true) { res.setHeader("Retry-After", "60"); res.status(429).json({ message: "Terlalu banyak permintaan. Coba sebentar lagi." }); return; }
      const allowed = await store.rpc<boolean>("consume_payment_rate", { p_key: `api:${paymentHash(`${path}:${ip}`)}`, p_limit: limit, p_seconds: seconds });
      let mailboxAllowed = true;
      const email: unknown = req.body?.email;
      if (emailAction && typeof email === "string" && email.length <= 254) mailboxAllowed = await store.rpc<boolean>("consume_payment_rate", { p_key: `mail:${paymentHash(email.trim().toLowerCase())}`, p_limit: 5, p_seconds: 900 });
      if (allowed !== true || mailboxAllowed !== true) { res.setHeader("Retry-After", String(seconds)); res.status(429).json({ message: "Terlalu banyak percobaan. Coba lagi nanti." }); return; }
      next();
    } catch { res.status(503).json({ message: "Perlindungan layanan sedang tidak tersedia. Coba lagi nanti." }); }
  };
}
