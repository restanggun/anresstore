# Architecture overview

Anres Store is a single repository with three deployable applications and shared workspace packages. Caddy terminates HTTPS and routes public storefront, customer app, admin, and API hostnames to the corresponding services.

## Applications

- `apps/web` is the customer storefront. It uses Next.js App Router and Supabase Auth for customer sessions.
- `apps/admin` is the operations dashboard. Sensitive API actions require server-verified roles, session checks, and MFA.
- `apps/api` is the NestJS REST API under `/v1`. It owns catalog presentation, price validation, payment state, order fulfillment, support workflows, and administrative authorization.

Shared UI, contracts, configuration, and Supabase clients live in `packages`. The database schema and migration history are maintained in `supabase/migrations`.

## External services

- Supabase provides Auth and hosted Postgres. Server-side API access uses a server secret; browser clients use only the public publishable key.
- Tripay creates payment invoices and reports payment events. The API verifies callback signatures and reconciles uncertain payment states.
- VIPayment provides supported game, prepaid, and social service catalog entries and supplier fulfillment. Manual services remain in the admin workflow.

## Payment and fulfillment states

Payment, fulfillment, and refund states are stored separately. The API validates the payable amount and order details on the server. A confirmed payment can make an eligible order ready for supplier fulfillment; supplier submission and supplier status checks are handled independently. Ambiguous supplier results require reconciliation and must not be resent blindly.

Currency values are integer rupiah amounts and timestamps are stored in UTC. Multi-step state changes use database functions where atomicity is required.

## Deployment

Production containers are defined in `infra/compose.production.yaml`. Caddy is the public edge; application ports remain private to the Compose network. API secrets are supplied at runtime from `apps/api/.env.production`, which is created on the server and excluded from source control and Docker build contexts.

See the [VPS deployment runbook](../operations/vps-deployment.md), [payment security notes](payment-security.md), and [API map](../api/README.md) before changing production behavior.
