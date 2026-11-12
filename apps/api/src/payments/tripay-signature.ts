import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the exact raw request body; parsing and reserializing JSON changes its signature. */
export function verifyTripayCallback(raw: Buffer, signature: unknown, privateKey: string): boolean {
  if (!privateKey || !Buffer.isBuffer(raw) || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", privateKey).update(raw).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
