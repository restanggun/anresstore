# API

The NestJS API runs under the `/v1` prefix. Local development uses port `4000`; production requests are routed through `api.anresstore.site` by Caddy.

## Main route groups

- `GET /v1/health` — process liveness check; it does not verify database or provider availability.
- `GET /v1/catalog/:category` — server-loaded catalog for supported categories.
- `/v1/payments/*` — payment channels, checkout, callbacks, invoice status, history, and refund requests.
- `/v1/admin/*` — role-protected catalog, account, order, support, and operational actions.
- `/v1/task-orders/*`, `/v1/premium-orders/*`, and `/v1/help/conversations/*` — task orders, premium-app orders, and support conversations.

Controllers and contracts are in `apps/api/src`. Authentication, ownership, role, origin, and payload checks are enforced by the API; frontend visibility is not an authorization boundary.

For payment state and provider behavior, see [payment security](../architecture/payment-security.md), [Tripay](../architecture/tripay-production.md), and [VIPayment fulfillment](../architecture/vipayment-fulfillment.md). The [VPS runbook](../operations/vps-deployment.md) describes runtime configuration and health checks.
