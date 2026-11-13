import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { readEnvironment } from "./config/environment";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { apiAbuseMiddleware } from "./common/api-abuse";
import { configureOutboundNetwork } from "./config/outbound-network";

async function bootstrap() {
  configureOutboundNetwork();
  const { port, origins, trustedProxies } = readEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.disable("x-powered-by");
  app.set("trust proxy", trustedProxies.length ? trustedProxies : false);
  app.useBodyParser("json", { limit: "16kb", strict: true });
  app.useBodyParser("urlencoded", { limit: "16kb", extended: false });
  app.use((_req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: origins, credentials: true });
  app.use(apiAbuseMiddleware());
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}
bootstrap().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
