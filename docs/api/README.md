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

## Reseller API

Approved resellers unlock API access after IDR 100,000 in cumulative paid and fulfilled wholesale purchases, excluding payment fees and completed refunds. Issue an API key from the account dashboard. Send the key as `Authorization: Bearer <key>` over HTTPS from the reseller's server. For rotation, issue a new key, update the integration, and revoke the previous key. The secret is shown once. Requests are limited per IP and reseller tier.

| Endpoint | Result |
| --- | --- |
| `GET /v1/reseller/catalog?category=game` or `category=prepaid` | Products available at the reseller's current tier, with `code`, `amount` in whole rupiah, and `requiresZone`. |
| `GET /v1/payments/channels` | Payment channels and accepted minimum and maximum amounts. |
| `POST /v1/payments/reseller-transactions` | Creates a live invoice using the storefront's payment pipeline. |
| `GET /v1/reseller/orders/{id}` | Payment and fulfillment status for an order owned by the authenticated reseller. |

To create an order, send JSON with a new UUID v4 in `id`, the category in `source`, `code` from the reseller catalog, `expectedAmount` from its `amount` field, the customer destination in `target`, and `targetZone` if required. Include `method`, `name`, `email`, and `phone` for billing. The response includes the invoice ID and the payment instructions available from the gateway. Poll order status until both payment and fulfillment are confirmed. On a timeout or ambiguous response, retry the same request with the same ID. Follow `409` by checking that invoice before quoting a revised order. Voucher payment and third-party accounts are outside the reseller key scope.

The production rollout requires both reseller migrations. Registration and customer checkout links start disabled. A super admin can set eligible SKU prices, enable registration, attach retail tier voucher templates, and set commission from the difference between public and Starter prices. Customer links are single-use and expire after seven days. After successful fulfillment and a 14-day hold, a super admin can record an external payout and its transfer reference. Refunds adjust earnings and flag already paid amounts for reconciliation.
