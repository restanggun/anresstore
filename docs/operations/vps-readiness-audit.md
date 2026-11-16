# VPS readiness audit

This file is a release gate, not a claim that deployment has happened. The source repository includes a production Compose setup, but production readiness must be verified against the actual VPS, hosted database, DNS, and provider accounts.

## Required evidence before launch

- A reviewed, clean release commit includes all required source and public assets; no local environment files, customer data, caches, or archive folders are part of the release.
- `apps/api/.env.production` is created on the server from `infra/api.env.example`, stored with restricted permissions, and passes `node scripts/check-production-env.mjs` without exposing its contents.
- Supabase keys are valid for the configured project. Compare hosted migration history and schema with the repository before applying missing migrations; back up the database and verify a restore first. The deployment runbook defines the migration range and procedure.
- The actual VPS egress address is allowed by VIPayment. A development/workspace egress address is not evidence of the VPS address.
- DNS points the storefront, auth, app, admin, and API hostnames to the VPS. Caddy obtains valid certificates, and application ports are not publicly exposed.
- Linux Docker images build from the release commit. Compose configuration, container health, restart behavior, backup recovery, and rollback are verified.
- Authentication, MFA, role restrictions, catalog loading, Tripay invoice and callback, VIPayment fulfillment, refunds, support, and one small end-to-end live transaction are checked on the deployed domains.
- Monitoring and an operator are in place for service availability, database/provider failures, pending or unknown payments, uncertain fulfillment, disk capacity, and backup status.

## Environment-specific validation

- Verify the Supabase server key against the configured project with a read-only API check; never copy a local environment file to the VPS.
- Confirm the actual VPS egress address and allow it with VIPayment before relying on production catalog or fulfillment. A development/workspace address is not evidence of the VPS address.
- Record Linux image and Compose validation from the VPS or another Docker-capable release host.

Do not mark a gate complete from a local build or a source-code review alone. Record the commit SHA, migration evidence, image digest, backup/restore result, smoke-test result, and operator in a private release record.
