import { HttpException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { digestGuestToken } from "./guest-access";

export type PaymentIdentity = { userId: string | null; guestHash: string | null };
const guestCookie = () => process.env.NODE_ENV === "production" ? "__Host-anres_payment_guest" : "anres_payment_guest";

export function paymentCookies(req: Request) {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of (req.headers.cookie ?? "").split(";")) {
    const index = entry.indexOf("=");
    if (index < 1) continue;
    const name = entry.slice(0, index).trim();
    if (Object.prototype.hasOwnProperty.call(result, name)) throw new HttpException("Cookie sesi ambigu. Hapus cookie situs lalu masuk kembali.", 400);
    try { result[name] = decodeURIComponent(entry.slice(index + 1)); }
    catch { throw new HttpException("Cookie sesi tidak valid.", 400); }
  }
  return result;
}

export class PaymentIdentityService {
  async resolve(req: Request): Promise<PaymentIdentity> {
    const cookies = paymentCookies(req);
    const guestHash = digestGuestToken(cookies[guestCookie()])?.toString("hex") ?? null;
    // Session cookies are verified with the auth server, never trusted as user claims.
    if (!cookies.anres_access && !cookies.anres_refresh) return { userId: null, guestHash };
    if (!cookies.anres_access || cookies.anres_access.length > 8192) throw new HttpException("Sesi berakhir. Masuk kembali sebelum checkout.", 401);
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new HttpException("Verifikasi sesi tidak tersedia.", 503);
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${cookies.anres_access}` },
        redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401 || response.status === 403) throw new HttpException("Sesi berakhir. Masuk kembali sebelum checkout.", 401);
      if (!response.ok) throw new Error();
      const user: unknown = await response.json();
      if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(user.id)) throw new Error();
      return { userId: user.id.toLowerCase(), guestHash };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Auth outages must not silently downgrade an account purchase into a guest purchase.
      throw new HttpException("Verifikasi sesi tidak tersedia. Coba lagi nanti.", 503);
    }
  }

  async establish(req: Request, res: Response) {
    const identity = await this.resolve(req);
    if (!identity.userId && !identity.guestHash) {
      const token = randomBytes(32).toString("base64url");
      res.cookie(guestCookie(), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400000 });
      identity.guestHash = digestGuestToken(token)!.toString("hex");
    }
    return { mode: identity.userId ? "account" : "guest", scope: createHash("sha256").update(identity.userId ?? identity.guestHash!).digest("hex") };
  }
}
