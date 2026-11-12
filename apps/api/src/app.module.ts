import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./common/health.controller";
import { HelpController } from "./help/help.controller";
import { CatalogController } from "./catalog/catalog.controller";

@Module({ controllers: [HealthController, AuthController, HelpController, CatalogController] })
export class AppModule {}
