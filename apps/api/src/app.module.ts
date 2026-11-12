import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./common/health.controller";
import { HelpController } from "./help/help.controller";

@Module({ controllers: [HealthController, AuthController, HelpController] })
export class AppModule {}
