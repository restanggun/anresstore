import { HttpException } from "@nestjs/common";
import { PaymentStore } from "../payments/payment-store";
import { redactAssistantText } from "./assistant-model";

export const tavilyEnabled = () => process.env.ADMIN_AI_TAVILY_ENABLED === "true" && !!process.env.TAVILY_API_KEY?.trim();

export function publicSearchQuery(value: unknown, prompt: string) {
  if (typeof value !== "string") throw new HttpException("Sebutkan kata kunci publik untuk Tavily.", 422);
  const query = value.trim();
  if (query.length < 3 || query.length > 160 ||
    !prompt.toLowerCase().includes(query.toLowerCase()) || redactAssistantText(query) !== query ||
    /(?:\bANRS[-\w]+\b|\b[0-9]{6,}\b|\b(?:otp|password|rekening|invoice|telepon|customer|pelanggan|token|secret)\b|[@/\\\[\]\x00-\x1f])/i.test(query)) {
    throw new HttpException("Tulis kata kunci publik yang eksplisit. Hapus nomor invoice, data pelanggan, dan kredensial.", 422);
  }
  return query;
}

export async function tavilySearch(value: unknown, prompt: string) {
  if (!tavilyEnabled()) throw new HttpException("Tavily Search belum dikonfigurasi.", 503);
  const query = publicSearchQuery(value, prompt);
  const allowed = await new PaymentStore().rpc<boolean>("consume_payment_rate", {
    p_key: "admin-assistant:tavily-daily", p_limit: 20, p_seconds: 86400,
  });
  if (allowed !== true) throw new HttpException("Kuota Tavily Search harian tercapai.", 429);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY!.trim()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_raw_content: false, include_answer: false, include_images: false, auto_parameters: false, safe_search: true }),
    });
    if ([429, 432, 433].includes(response.status)) throw new HttpException("Tavily Search sedang membatasi permintaan atau kuota habis.", 429);
    if (!response.ok) throw new Error();
    const stream = response.body?.getReader();
    if (!stream) throw new Error();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await stream.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 256000) { void stream.cancel().catch(() => {}); throw new Error(); }
        chunks.push(value);
      }
    } finally { stream.releaseLock(); }
    const payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as { results?: unknown };
    if (!Array.isArray(payload.results)) throw new Error();
    const results = payload.results.slice(0, 5).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.title !== "string" || typeof row.url !== "string" || row.url.length > 1500 || typeof row.content !== "string" || !row.content.trim()) return [];
      try {
        const url = new URL(row.url);
        if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
            /^[\d.]+$/.test(url.hostname) || /\.(local|localhost|internal|test)$/i.test(url.hostname)) return [];
        return [{ title: redactAssistantText(row.title).slice(0, 130), url: url.href, excerpt: redactAssistantText(row.content.slice(0, 950)) }];
      } catch { return []; }
    }).slice(0, 5);
    return { query, results, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException("Tavily Search belum bisa dihubungi. Periksa key dan kuota di dashboard Tavily.", 503);
  }
}
