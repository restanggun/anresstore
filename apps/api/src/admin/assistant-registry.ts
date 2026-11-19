import { HttpException } from "@nestjs/common";
import { adminDb } from "./admin-store";

export const definitions = {
  reply: ["Panduan", "Menjawab panduan dan meminta klarifikasi."],
  catalog_search: ["Cari produk", "Cari nama varian atau SKU di katalog."],
  catalog_edit: ["Edit produk", "Siapkan draf harga, nama, deskripsi, atau visibilitas."],
  catalog_add: ["Tambah produk", "Siapkan draf penambahan varian aktif dari layanan provider yang tersedia."],
  catalog_manage: ["Kelola katalog lengkap", "Siapkan draf varian manual, pemetaan, modal, paket provider, penghapusan, pemulihan, dan pemindahan produk."],
  product_rules: ["Aturan produk", "Siapkan draf tarif Joki Tugas atau ketentuan produk Aplikasi Premium."],
  promotion_manage: ["Atur promo", "Siapkan, perbarui, atau nonaktifkan promo untuk satu varian terpilih."],
  promotions: ["Cek promo", "Tinjau jadwal promo yang aktif."],
  pricing: ["Analisis margin", "Hitung margin, markup, dan harga target dari modal yang tercatat."],
  duplicates: ["Cek varian duplikat", "Cari nama varian yang sama di satu produk."],
  promo_preview: ["Simulasi promo", "Hitung diskon dan estimasi margin tanpa menerbitkan jadwal."],
  pricing_batch: ["Draf harga massal", "Siapkan draf dari target margin atau CSV harga."],
  transactions: ["Cari transaksi", "Periksa pesanan, pembayaran, atau antrean pemenuhan."],
  invoice_timeline: ["Kronologi invoice", "Tampilkan status dan jejak audit yang tersedia."],
  reconcile: ["Rekonsiliasi gateway", "Bandingkan invoice dengan status dan nilai di Tripay."],
  task_orders: ["Pantau joki tugas", "Ringkas antrean pesanan joki."],
  premium_orders: ["Pantau pesanan premium", "Ringkas antrean pesanan premium."],
  analytics: ["Ringkas transaksi", "Ringkas transaksi dalam 7, 30, atau 90 hari."],
  finance_category: ["Analisis omzet per kategori", "Hitung omzet dan margin dari transaksi berbayar."],
  operations: ["Pantau operasional", "Tinjau indikator antrean dan kondisi sistem."],
  balances: ["Cek saldo provider", "Buka saldo langsung di ringkasan admin."],
  support: ["Cek antrean CS", "Lihat jumlah tiket baru dan belum dibaca."],
  support_draft: ["Draf balasan CS", "Tulis balasan berdasarkan situasi dan bukti yang diperiksa."],
  support_handoff: ["Ringkas kasus CS", "Susun ringkasan dan tindakan lanjutan untuk staf."],
  sop_search: ["Cari SOP", "Temukan panduan internal Anres."],
  content_draft: ["Draf konten katalog", "Siapkan deskripsi, FAQ, atau materi promo."],
  web_search: ["Cari web dengan Tavily", "Cari dokumentasi dan informasi publik, dengan sumber."],
  file_review: ["Analisis lampiran", "Baca lampiran teks yang diizinkan."],
  vouchers: ["Cek voucher", "Periksa jumlah voucher yang tercatat."],
  voucher_manage: ["Kelola voucher", "Siapkan draf pembuatan, perubahan, atau penonaktifan voucher."],
} as const;

export type AssistantTool = keyof typeof definitions;
export const isAssistantTool = (value: unknown): value is AssistantTool =>
  typeof value === "string" && Object.hasOwn(definitions, value);
export const editingTools: readonly AssistantTool[] = ["catalog_edit", "catalog_add", "catalog_manage", "product_rules", "promotion_manage", "voucher_manage", "pricing_batch"];
type Policy = { enabled: boolean; roleIds: string[] };
export type SkillPolicy = Policy & { guidance?: string; example?: string };
export type AgentProfile = Policy & { id: string; name: string; instructions: string; tools: AssistantTool[] };
type Sop = { id: string; title: string; body: string };
type Registry = { skills: Partial<Record<AssistantTool, SkillPolicy>>; agents: AgentProfile[]; sops: Sop[] };
type Access = { superAdmin: boolean; roleId: string | null };
const enabled = { enabled: true, roleIds: [] };

const builtInAgents: AgentProfile[] = [
  { ...enabled, id: "catalog", name: "Katalog & harga", instructions: "Cari kategori dan produk induk dulu. Untuk Diamond Mobile Legends, batasi ke varian yang diminta (misalnya rentang 100–400) dan tampilkan daftar serta jumlah sebelum membuat draf. Jangan memilih seluruh katalog tanpa izin eksplisit. Periksa modal, harga jual, promo aktif, visibilitas, pemetaan supplier, fulfillment, jumlah paket, tarif tugas, dan aturan produk premium. Semua perubahan perlu kartu tinjauan admin.", tools: ["catalog_search", "catalog_edit", "catalog_manage", "catalog_add", "product_rules", "promotion_manage", "promotions", "pricing", "duplicates", "promo_preview", "pricing_batch", "vouchers", "voucher_manage"] },
  { ...enabled, id: "orders", name: "Operasional pesanan", instructions: "Pisahkan status pembayaran dan pemenuhan. Prioritaskan antrean yang perlu ditinjau.", tools: ["transactions", "invoice_timeline", "task_orders", "premium_orders", "operations", "sop_search"] },
  { ...enabled, id: "finance", name: "Keuangan & rekonsiliasi", instructions: "Nyatakan cakupan tanggal dan biaya yang belum diketahui. Tinjau selisih yang terverifikasi.", tools: ["analytics", "finance_category", "reconcile", "invoice_timeline", "transactions", "balances"] },
  { ...enabled, id: "support", name: "Bantuan pelanggan", instructions: "Gunakan status invoice terverifikasi jika tersedia. Susun draf dan hindari janji yang belum pasti.", tools: ["support", "support_draft", "support_handoff", "invoice_timeline", "sop_search"] },
  { ...enabled, id: "research", name: "Riset produk & supplier", instructions: "Gunakan sumber publik dan tampilkan tautan yang diperoleh. Pisahkan harga publik dari modal internal.", tools: ["web_search", "catalog_search", "sop_search"] },
  { ...enabled, id: "content", name: "Konten & promo", instructions: "Gunakan fakta katalog dan harga yang tersedia. Jadwal dan perubahan promo harus menjadi draf untuk ditinjau admin.", tools: ["content_draft", "catalog_search", "promo_preview", "promotions", "promotion_manage", "web_search"] },
  { ...enabled, id: "monitor", name: "Monitoring operasional", instructions: "Ringkas kondisi antrean dan arahkan masalah ke SOP yang sesuai.", tools: ["operations", "transactions", "task_orders", "premium_orders", "sop_search"] },
];

const builtInSops: Sop[] = [
  { id: "payment-check", title: "Pembayaran atau invoice tertahan", body: "Cek invoice di Pembayaran. Cocokkan status dan nominal melalui rekonsiliasi. Jika berbeda, buka antrean tinjauan dan catat bukti gateway sebelum mengambil keputusan." },
  { id: "fulfillment", title: "Pesanan lunas belum diproses", body: "Buka Antrean pemenuhan. Bedakan pesanan otomatis, joki tugas, dan premium. Cek status supplier dan catatan yang ada. Tindak lanjuti dari ruang kerja sesuai jenis pesanan." },
  { id: "pricing", title: "Tinjauan perubahan harga", body: "Periksa SKU, harga modal, promo aktif, dan visibilitas. Tinjau perubahan tiap varian sebelum menyimpan. Margin dihitung dari harga jual, markup dari modal." },
];

export const assistantRegistryEnabled = () => process.env.ADMIN_AI_REGISTRY_ENABLED === "true";
export const assistantLegacyAgents: Record<string, string> = {
  "Katalog & harga": "catalog", "Operasional pesanan": "orders",
  "Analisis transaksi": "finance", "Bantuan pelanggan": "support",
};
export const assistantLegacySkills: Record<string, AssistantTool> = {
  "Edit harga": "catalog_edit", "Edit produk": "catalog_edit", "Kelola katalog": "catalog_manage", "Aturan produk": "product_rules",
  "Tambah produk": "catalog_add", "Atur promo": "promotion_manage", "Kelola voucher": "voucher_manage",
};

export function assistantPolicyAllows(policy: Policy | undefined, access: Access) {
  return (policy?.enabled ?? true) && (!policy?.roleIds.length || access.superAdmin || (!!access.roleId && policy.roleIds.includes(access.roleId)));
}

export function resolvedRegistry(config?: Registry) {
  const skills = config?.skills ?? {};
  const agents = new Map(builtInAgents.map(agent => [agent.id, agent]));
  for (const agent of config?.agents ?? []) agents.set(agent.id, agent);
  return { skills, agents: [...agents.values()], sops: config?.sops ?? builtInSops };
}

export async function loadAssistantRegistry() {
  const [row] = await adminDb<{ revision: number; config: Registry }>("admin_assistant_registry", "?id=eq.1&select=revision,config");
  if (!row) throw new HttpException("Migrasi Pengelola Skill & Agent belum tersedia.", 503);
  return { revision: row.revision, ...resolvedRegistry(row.config) };
}

function record(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Record<string, unknown>;
  throw new HttpException("Format pengaturan asisten tidak valid.", 400);
}

function text(input: unknown, max: number, optional = false) {
  if (typeof input !== "string" || input.length > max || (!optional && !input.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/.test(input)) {
    throw new HttpException("Periksa judul dan isi pengaturan asisten.", 400);
  }
  return input.trim();
}

export function validateAssistantRegistry(input: unknown, roleIds: string[]) {
  const body = record(input);
  const rawSkills = record(body.skills);
  const allowedRoles = new Set(roleIds);
  const policy = (value: Record<string, unknown>): Policy => {
    if (typeof value.enabled !== "boolean" || !Array.isArray(value.roleIds) || value.roleIds.length > 100 ||
      value.roleIds.some(id => typeof id !== "string" || !allowedRoles.has(id))) {
      throw new HttpException("Role atau status skill/agent tidak valid.", 400);
    }
    return { enabled: value.enabled, roleIds: [...new Set(value.roleIds as string[])] };
  };
  const id = (value: unknown) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) throw new HttpException("ID harus berupa slug huruf kecil.", 400);
    return value;
  };
  if (!Array.isArray(body.agents) || body.agents.length > 24 || !Array.isArray(body.sops) || body.sops.length > 30) {
    throw new HttpException("Batas pengaturan adalah 24 agent dan 30 SOP.", 400);
  }
  const skills: Registry["skills"] = {};
  for (const [key, value] of Object.entries(rawSkills)) {
    if (!isAssistantTool(key) || key === "reply") throw new HttpException("Aksi skill harus terdaftar di backend.", 400);
    const item = record(value);
    skills[key] = { ...policy(item), guidance: text(item.guidance ?? "", 360, true), example: text(item.example ?? "", 160, true) };
  }
  const agents = body.agents.map(raw => {
    const value = record(raw);
    if (!Array.isArray(value.tools) || !value.tools.length || value.tools.some(tool => !isAssistantTool(tool) || tool === "reply")) {
      throw new HttpException("Pilih skill yang terdaftar untuk setiap agent.", 400);
    }
    return { id: id(value.id), name: text(value.name, 60), instructions: text(value.instructions, 1200, true), tools: [...new Set(value.tools as AssistantTool[])], ...policy(value) };
  });
  const sops = body.sops.map(raw => {
    const value = record(raw);
    return { id: id(value.id), title: text(value.title, 100), body: text(value.body, 2400) };
  });
  if (new Set(agents.map(agent => agent.id)).size !== agents.length || new Set(sops.map(sop => sop.id)).size !== sops.length ||
      agents.some(agent => !builtInAgents.some(defaultAgent => defaultAgent.id === agent.id) && !agent.id.startsWith("custom-"))) {
    throw new HttpException("ID agent atau SOP duplikat atau tidak valid.", 400);
  }
  return { skills, agents, sops };
}
