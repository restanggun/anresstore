/** Kontrak tipe bersama; tidak ada runtime export. Nilai rupiah selalu integer. */
export type Rupiah = number;
export type PaymentStatus = "pending" | "paid" | "expired" | "failed";
export type FulfillmentStatus = "pending" | "processing" | "succeeded" | "failed";
export type RefundStatus = "none" | "pending" | "succeeded" | "failed";
export interface HealthResponse {
  status: "ok";
  service: "anres-api";
  timestamp: string;
}
