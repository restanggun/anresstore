import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./common/health.controller";
import { HelpController } from "./help/help.controller";
import { CatalogController } from "./catalog/catalog.controller";
import { ProductReviewsController } from "./catalog/product-reviews.controller";
import { StorefrontController } from "./catalog/storefront.controller";
import { CampaignController } from "./catalog/campaign.controller";
import { PaymentsController } from "./payments/payments.controller";
import { AdminController } from "./admin/admin.controller";
import { FulfillmentWorker } from "./payments/fulfillment-worker";
import { ConversationsController } from "./help/conversations.controller";
import { AiSessionsController } from "./help/ai-sessions.controller";
import {SupportEmailWorker} from "./help/support-email-worker";
import { TaskOrdersController } from "./payments/task-orders.controller";
import { PremiumOrdersController } from "./payments/premium-orders.controller";

@Module({ controllers: [HealthController, AuthController, HelpController, ConversationsController, AiSessionsController, CatalogController, ProductReviewsController, CampaignController, StorefrontController, PaymentsController, TaskOrdersController, PremiumOrdersController, AdminController], providers: [FulfillmentWorker,SupportEmailWorker] })
export class AppModule {}
