import { HttpException } from "@nestjs/common";

export function percentage(value: unknown, max = 95) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new HttpException(`Gunakan persentase antara 0 dan ${max} dengan maksimal dua angka desimal.`, 422);
  }
  return value;
}

export function targetPrice(cost: number, target: number, mode: "margin" | "markup") {
  const basisPoints = Math.round(target * 100);
  return Math.ceil(mode === "margin" ? cost * 10000 / (10000 - basisPoints) : cost * (10000 + basisPoints) / 10000);
}

export function parseAssistantPriceCsv(text: string) {
  const lines = text.replace(/^\ufeff/, "").trim().split(/\r?\n/);
  if (lines.shift()?.trim().toLowerCase() !== "sku,harga" || !lines.length || lines.length > 20) {
    throw new HttpException("CSV harus berheader sku,harga dan berisi 1 sampai 20 varian.", 422);
  }
  const rows = lines.map(line => {
    const match = /^\s*([a-z0-9._-]{1,120})\s*,\s*(\d{1,9})\s*$/i.exec(line);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 100000000) {
      throw new HttpException("Setiap baris CSV harus berisi SKU dan harga rupiah bulat.", 422);
    }
    return { sku: match[1]!, price: Number(match[2]) };
  });
  if (new Set(rows.map(row => row.sku.toLowerCase())).size !== rows.length) throw new HttpException("SKU dalam CSV berulang.", 422);
  return rows;
}
