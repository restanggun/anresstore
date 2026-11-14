import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { boundedFetch } from "../common/bounded-fetch";
import { paymentCookies } from "../payments/payment-identity";

type Session = { user: Record<string, any>; token: string };
const sessions = new WeakMap<Request, Session>();
const refreshing = new Map<string, Promise<Record<string, any>>>();
const month = 30 * 86400000;
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" });

export function writeSession(req: Request, res: Response, data: Record<string, any>, remember?: boolean) {
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new HttpException("Sesi tidak tersedia.", 401);
  const persistent = remember ?? paymentCookies(req).anres_persist !== "0";
  const seconds = Number.isFinite(data.expires_in) && data.expires_in > 0 ? Math.min(data.expires_in, 86400) : 3600;
  res.setHeader("Cache-Control", "no-store");
  res.cookie("anres_access", data.access_token, { ...options(), ...(persistent ? { maxAge: seconds * 1000 } : {}) });
  res.cookie("anres_refresh", data.refresh_token, { ...options(), ...(persistent ? { maxAge: month } : {}) });
  // This cookie is a retention preference, never proof of authentication or MFA.
  if (remember !== undefined) res.cookie("anres_persist", persistent ? "1" : "0", { ...options(), ...(persistent ? { maxAge: month } : {}) });
}

export function sessionAccessToken(req: Request) { return sessions.get(req)?.token ?? paymentCookies(req).anres_access; }

export async function resolveSession(req: Request, res: Response): Promise<Session> {
  const cookies = paymentCookies(req);
  if (!cookies.anres_access && !cookies.anres_refresh) throw new HttpException("Silakan masuk kembali.", 401);
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpException("Autentikasi server belum dikonfigurasi.", 503);
  async function user(token: string) {
    const response = await boundedFetch(`${url}/auth/v1/user`, { headers: { apikey: key!, Authorization: `Bearer ${token}` }, redirect: "error" });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new HttpException("Verifikasi sesi tidak tersedia. Coba lagi.", 503);
    const value = await response.json();
    if (!value?.id) throw new HttpException("Sesi tidak valid.", 401);
    return value;
  }
  if (cookies.anres_access) {
    const account = await user(cookies.anres_access);
    if (account) { const session = { user: account, token: cookies.anres_access }; sessions.set(req, session); return session; }
  }
  if (!cookies.anres_refresh) throw new HttpException("Silakan masuk kembali.", 401);
  const refreshKey = createHash("sha256").update(`${url}:${cookies.anres_refresh}`).digest("hex");
  let pending = refreshing.get(refreshKey);
  if (!pending) {
    pending = (async () => {
      const response = await boundedFetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", redirect: "error", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: cookies.anres_refresh }) });
      if (!response.ok) throw new HttpException(response.status < 500 ? "Sesi berakhir. Silakan masuk kembali." : "Pembaruan sesi belum tersedia. Coba lagi.", response.status < 500 ? 401 : 503);
      const data = await response.json();
      if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new HttpException("Sesi berakhir. Silakan masuk kembali.", 401);
      const account = await user(data.access_token);
      if (!account) throw new HttpException("Sesi berakhir. Silakan masuk kembali.", 401);
      return { ...data, user: account };
    })();
    refreshing.set(refreshKey, pending);
  }
  try {
    const data = await pending;
    writeSession(req, res, data);
    const session = { user: data.user, token: data.access_token };
    sessions.set(req, session);
    return session;
  } finally { if (refreshing.get(refreshKey) === pending) refreshing.delete(refreshKey); }
}
