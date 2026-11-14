export type PaymentChannel = {
  code: string; name: string; group: string; iconUrl: string | null;
  minimum: number; maximum: number; fee: { flat: number; percent: number | string };
};
export const paymentGroups = ["QRIS", "E-wallet", "Virtual account", "Internet banking", "Minimarket", "Metode lainnya"] as const;
export function paymentGroup(channel: Pick<PaymentChannel, "code" | "group">): typeof paymentGroups[number] {
  const group = (channel.group || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^QRIS/i.test(channel.code)) return "QRIS";
  if (["ewallet", "digitalwallet"].includes(group)) return "E-wallet";
  if (["virtualaccount", "banktransfer"].includes(group) || /VA$/.test(channel.code)) return "Virtual account";
  if (["ebanking", "internetbanking", "onlinebanking"].includes(group)) return "Internet banking";
  if (["conveniencestore", "conveniencestores", "retail", "retailoutlet"].includes(group) || /^(ALFAMART|ALFAMIDI|INDOMARET)$/.test(channel.code)) return "Minimarket";
  return "Metode lainnya";
}
export function channelFee(channel: PaymentChannel): string {
  const flat = Number(channel.fee?.flat || 0), percent = Number(channel.fee?.percent || 0);
  if (!Number.isFinite(flat) || !Number.isFinite(percent) || flat < 0 || percent < 0) return "Biaya ditampilkan pada invoice";
  const parts = [flat ? `Rp${flat.toLocaleString("id-ID")}` : "", percent ? `${percent.toLocaleString("id-ID")}%` : ""].filter(Boolean);
  return parts.length ? `Biaya ${parts.join(" + ")}` : "Tanpa biaya admin";
}
