import { HttpException } from "@nestjs/common";

export async function boundedFetch(url: string, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, redirect: "error", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  } catch { throw new HttpException("Layanan tidak dapat dihubungi. Periksa koneksi dan coba lagi.", 503); }
}
