import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@anres/contracts";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "anres-api", timestamp: new Date().toISOString() };
  }
}
