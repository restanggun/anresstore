import { isIP } from "node:net";

export function readEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT harus integer 1–65535.");
  const origins = (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => {
    try { const parsed = new URL(origin); return !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin; }
    catch { return true; }
  })) throw new Error("CORS_ORIGINS harus berisi origin HTTP/HTTPS eksplisit, dipisahkan koma.");
  const trustedProxies = (env.TRUST_PROXY_CIDRS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (trustedProxies.some(value => {
    const [address, prefix, extra] = value.split("/");
    const version = isIP(address ?? "");
    return !version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)));
  })) throw new Error("TRUST_PROXY_CIDRS hanya menerima IP/CIDR proxy yang dipercaya; wildcard tidak diizinkan.");
  if (env.NODE_ENV === "production" && (origins.some(origin => !origin.startsWith("https://")) ||
      !env.AUTH_WEB_ORIGIN?.startsWith("https://") || !env.AUTH_API_ORIGIN?.startsWith("https://"))) {
    throw new Error("Production memerlukan origin web/API HTTPS eksplisit.");
  }
  return { port, origins, trustedProxies };
}
