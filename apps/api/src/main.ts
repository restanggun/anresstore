import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { readEnvironment } from "./config/environment";

async function bootstrap() {
  const { port, origins } = readEnvironment();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}
bootstrap().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
