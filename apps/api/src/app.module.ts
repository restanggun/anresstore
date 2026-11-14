import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./common/health.controller";
import { HelpController } from "./help/help.controller";
import { CatalogController } from "./catalog/catalog.controller";
import { PaymentsController } from "./payments/payments.controller";
import { AdminController } from "./admin/admin.controller";
import { FulfillmentWorker } from "./payments/fulfillment-worker";
import { ConversationsController } from "./help/conversations.controller";
import { AiSessionsController } from "./help/ai-sessions.controller";

@Module({ controllers: [HealthController, AuthController, HelpController, ConversationsController, AiSessionsController, CatalogController, PaymentsController, AdminController], providers: [FulfillmentWorker] })
export class AppModule {}
