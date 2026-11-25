import QRCode from "qrcode";
import { adminDb } from "../admin/admin-store";
import { qrisForAmount } from "./qris-payload";

export async function manualQrisImage(amount: number) {
  const [settings] = await adminDb<{ payload: string }>("premium_qris_settings", "?id=eq.1&select=payload");
  return settings ? QRCode.toDataURL(qrisForAmount(settings.payload, amount), {
    errorCorrectionLevel: "M", margin: 2, width: 480,
  }) : null;
}
