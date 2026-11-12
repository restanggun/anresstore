export function readEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT harus integer 1–65535.");
  const origins = (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => {
    try { const parsed = new URL(origin); return !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin; }
    catch { return true; }
  })) throw new Error("CORS_ORIGINS harus berisi origin HTTP/HTTPS eksplisit, dipisahkan koma.");
  return { port, origins };
}
