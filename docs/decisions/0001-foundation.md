# 0001 — Application foundation

- Status: accepted
- Date: 2026-11-16

## Decision

Keep the storefront, operations dashboard, and REST API in one npm-workspaces monorepo. Use shared packages for UI, contracts, configuration, and Supabase access. Deploy the three applications as separate containers behind Caddy, with hosted Supabase as the managed database and identity service.

The current application stack is Next.js and React for the web interfaces, NestJS for the API, TypeScript across the workspace, and PostgreSQL through Supabase. Node.js 24 is used by the production image and CI; the repository requires Node.js `>=22.18` for local development.

## Rationale

- Shared contracts and UI can change alongside their consumers.
- Separate application processes keep browser interfaces and server-only provider credentials apart.
- One VPS and Docker Compose are sufficient for the current deployment shape; add queues or other infrastructure when measured workload requires them.
- Payment, fulfillment, and administrative state transitions that need atomicity are implemented as database functions rather than multi-request client workflows.

## Consequences

- A release must build and deploy all affected workspaces from one reviewed commit.
- Production secrets stay in the API runtime environment and never enter browser bundles or source control.
- Database migrations and the API version must be coordinated; rollback does not automatically reverse schema changes.
