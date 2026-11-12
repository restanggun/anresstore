import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Return the plaintext only to the guest; persist the digest, never the token. */
export function createGuestAccess(): { token: string; digest: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: digestGuestToken(token)! };
}

export function digestGuestToken(token: unknown): Buffer | null {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) return null;
  return createHash("sha256").update(bytes).digest();
}

export function verifyGuestAccess(token: unknown, storedDigest: Buffer): boolean {
  const digest = digestGuestToken(token);
  return digest !== null && Buffer.isBuffer(storedDigest) && storedDigest.length === 32 && timingSafeEqual(digest, storedDigest);
}
