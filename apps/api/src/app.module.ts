import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./common/health.controller";
import { HelpController } from "./help/help.controller";
import { CatalogController } from "./catalog/catalog.controller";
import { PaymentsController } from "./payments/payments.controller";
import { AdminController } from "./admin/admin.controller";

@Module({ controllers: [HealthController, AuthController, HelpController, CatalogController, PaymentsController, AdminController] })
export class AppModule {}
