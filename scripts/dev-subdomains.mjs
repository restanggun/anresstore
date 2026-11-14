import { spawn } from "node:child_process";
const env = {
  ...process.env,
  NEXT_PUBLIC_WEB_URL: "http://anres.localhost:3000",
  NEXT_PUBLIC_AUTH_URL: "http://auth.anres.localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://app.anres.localhost:3000",
  NEXT_PUBLIC_ADMIN_URL: "http://admin.anres.localhost:3001",
  NEXT_PUBLIC_API_URL: "http://api.anres.localhost:4000/v1",
  AUTH_WEB_ORIGIN: "http://anres.localhost:3000",
  AUTH_AUTH_ORIGIN: "http://auth.anres.localhost:3000",
  AUTH_APP_ORIGIN: "http://app.anres.localhost:3000",
  AUTH_ADMIN_ORIGIN: "http://admin.anres.localhost:3001",
  AUTH_API_ORIGIN: "http://api.anres.localhost:4000",
  ADMIN_ALLOWED_ORIGINS: "http://admin.anres.localhost:3001",
};
env.CORS_ORIGINS = [env.AUTH_WEB_ORIGIN, env.AUTH_AUTH_ORIGIN, env.AUTH_APP_ORIGIN, env.AUTH_ADMIN_ORIGIN].join(",");
console.log("Local subdomains:", env.CORS_ORIGINS);
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
