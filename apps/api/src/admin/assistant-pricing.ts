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
  if (lines.shift()?.trim().toLowerCase() !== "sku,harga" || !lines.length || lines.length > 50) {
    throw new HttpException("CSV harus berheader sku,harga dan berisi 1 sampai 50 varian.", 422);
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

export type AssistantCatalogImport = {
  line: number;
  sku: string;
  category?: string;
  currentName?: string;
  currentProduct?: string;
  patch: { name?: string; price?: number; description?: string; active?: boolean };
};

const catalogImportKeys: Record<string, string> = {
  sku: "sku", code: "sku", provider_code: "sku", item_code: "sku", kode: "sku", kode_produk: "sku",
  category: "category", kategori: "category",
  current_name: "currentName", match_name: "currentName", expected_name: "currentName", nama_lama: "currentName", nama_saat_ini: "currentName",
  current_product: "currentProduct", match_product: "currentProduct", produk_lama: "currentProduct",
  name: "name", nama: "name", new_name: "name", nama_baru: "name",
  price: "price", harga: "price", sell_price: "price", harga_jual: "price", harga_baru: "price",
  description: "description", deskripsi: "description", keterangan: "description",
  active: "active", aktif: "active", visible: "active", tampil: "active", status: "active",
};

function catalogImportField(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
}

function catalogImportBoolean(value: unknown, line: number) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("id-ID");
    if (["true", "1", "ya", "aktif", "tampil", "show", "active"].includes(normalized)) return true;
    if (["false", "0", "tidak", "nonaktif", "sembunyi", "sembunyikan", "hide", "inactive"].includes(normalized)) return false;
  }
  throw new HttpException(`Nilai status di baris ${line} harus aktif/nonaktif atau true/false.`, 422);
}

function catalogImportPrice(value: unknown, line: number) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    if (value < 1 || value > 100000000) throw new HttpException(`Harga di baris ${line} harus Rp1 sampai Rp100.000.000.`, 422);
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^(?:rp|idr)\s*/i, "").replace(/\s/g, "");
    const digits = /^\d+$/.test(normalized) ? normalized
      : /^\d{1,3}(?:[.,]\d{3})+$/.test(normalized) ? normalized.replace(/[.,]/g, "") : "";
    const price = Number(digits);
    if (digits && Number.isSafeInteger(price) && price >= 1 && price <= 100000000) return price;
  }
  throw new HttpException(`Harga di baris ${line} harus rupiah bulat yang valid.`, 422);
}

function parseCatalogImportRow(value: unknown, line: number): AssistantCatalogImport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpException(`Baris ${line} harus berupa objek SKU dan perubahan.`, 422);
  const source = value as Record<string, unknown>;
  const nested = source.patch && typeof source.patch === "object" && !Array.isArray(source.patch) ? source.patch as Record<string, unknown> : {};
  const fields = { ...source, ...nested };
  const result: Record<string, unknown> = {};
  for (const [rawKey, fieldValue] of Object.entries(fields)) {
    if (rawKey === "patch") continue;
    const key = catalogImportKeys[catalogImportField(rawKey)];
    if (!key) throw new HttpException(`Kolom ${rawKey} di baris ${line} belum didukung untuk impor aman.`, 422);
    if (typeof fieldValue === "string" && !fieldValue.trim() && key !== "sku") continue;
    if (key in result) throw new HttpException(`Kolom ${rawKey} berulang di baris ${line}.`, 422);
    result[key] = fieldValue;
  }
  const sku = typeof result.sku === "number" && Number.isSafeInteger(result.sku) && result.sku >= 0 ? String(result.sku) : result.sku;
  if (typeof sku !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(sku.trim())) {
    throw new HttpException(`SKU di baris ${line} wajib tepat dan hanya boleh berisi huruf, angka, titik, garis, atau underscore.`, 422);
  }
  const category = typeof result.category === "string" ? result.category.trim().toLowerCase() : result.category;
  if (category !== undefined && (typeof category !== "string" || !["game", "prepaid", "apps", "social", "tasks"].includes(category))) {
    throw new HttpException(`Kategori di baris ${line} tidak valid.`, 422);
  }
  const textValue = (key: string, max: number) => {
    const entry = result[key];
    if (entry === undefined) return undefined;
    if (typeof entry !== "string" || entry.length > max || /[<>\u0000-\u001f]/.test(entry) || !entry.trim()) {
      throw new HttpException(`Nilai ${key} di baris ${line} tidak valid.`, 422);
    }
    return entry.trim();
  };
  const currentName = textValue("currentName", 200);
  const currentProduct = textValue("currentProduct", 100);
  const patch = {
    ...(result.name !== undefined && { name: textValue("name", 200)! }),
    ...(result.price !== undefined && { price: catalogImportPrice(result.price, line) }),
    ...(result.description !== undefined && { description: textValue("description", 2000)! }),
    ...(result.active !== undefined && { active: catalogImportBoolean(result.active, line) }),
  };
  if (!Object.keys(patch).length) throw new HttpException(`Baris ${line} tidak berisi perubahan. Gunakan nama/nama_baru, harga, deskripsi, atau status.`, 422);
  return { line, sku: sku.trim(), ...(typeof category === "string" && { category }),
    ...(currentName && { currentName }), ...(currentProduct && { currentProduct }), patch };
}

function parseDelimitedRow(line: string, separator: string) {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  if (quoted) throw new HttpException("Format CSV memiliki tanda kutip yang tidak berpasangan.", 422);
  cells.push(value.trim());
  return cells;
}

export function parseAssistantCatalogImport(text: string, format: "csv" | "json"): AssistantCatalogImport[] {
  let values: unknown[];
  if (format === "json") {
    let parsed: unknown;
    try { parsed = JSON.parse(text.replace(/^\ufeff/, "")); }
    catch { throw new HttpException("JSON impor tidak valid.", 422); }
    if (Array.isArray(parsed)) values = parsed;
    else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const envelope = parsed as Record<string, unknown>;
      const list = envelope.items ?? envelope.products ?? envelope.variants ?? envelope.rows ?? envelope.data;
      if (!Array.isArray(list)) throw new HttpException("JSON harus berupa array atau memiliki items/products/variants/rows/data.", 422);
      values = list;
    } else throw new HttpException("JSON harus berupa daftar objek produk.", 422);
    if (!values.length || values.length > 50) throw new HttpException("Impor harus berisi 1 sampai 50 baris.", 422);
    return values.map((row, index) => parseCatalogImportRow(row, index + 1));
  }

  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2 || lines.length > 51) throw new HttpException("CSV harus memiliki header dan 1 sampai 50 baris produk.", 422);
  const headerLine = lines[0]!;
  const separator = [",", ";", "\t", "|"].sort((left, right) => headerLine.split(right).length - headerLine.split(left).length)[0]!;
  const headers = parseDelimitedRow(headerLine, separator).map(catalogImportField);
  if (new Set(headers).size !== headers.length || headers.some(header => !catalogImportKeys[header])) {
    throw new HttpException("Header CSV harus memakai SKU, harga/nama/deskripsi/status, dan kolom opsional kategori/nama_lama/produk_lama.", 422);
  }
  values = lines.slice(1).map((line, index) => {
    const cells = parseDelimitedRow(line, separator);
    if (cells.length !== headers.length) throw new HttpException(`Jumlah kolom CSV di baris ${index + 2} tidak sesuai header.`, 422);
    return Object.fromEntries(headers.map((header, position) => [header, cells[position]]));
  });
  return values.map((row, index) => parseCatalogImportRow(row, index + 2));
}
