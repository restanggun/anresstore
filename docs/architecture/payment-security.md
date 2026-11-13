# Payment security review

## Deployment decision

**Sandbox hardening implemented; live production payments are not enabled or certified.** There is no meaningful guarantee of “almost 100% secure.” The controls below address specific failures, with automated evidence. They do not replace a review of the deployed infrastructure, independent penetration testing, or provider settlement reconciliation.

The live Tripay endpoint is rejected by code. Sandbox payments never submit VIPayment fulfillment requests. Legacy client-priced cart orders are rejected when `NODE_ENV=production`. Client JavaScript and browser storage are untrusted; changing them cannot mark a payment paid, set its server price, or select another account as owner.

## Implemented controls

| Risk | Control | Evidence |
| --- | --- | --- |
| IDOR / reading another invoice | Account owner comes from Supabase `/auth/v1/user`; account invoices require that user. New guest invoices require the matching opaque HttpOnly session cookie. A known ID or bearer token cannot open another account's invoice. | `payments.test.mjs`, `payment-identity.test.mjs` |
| Guest credential exposure | 256-bit random server cookie; HttpOnly, SameSite=Lax, Secure and `__Host-` in production. Database stores only its SHA-256 digest. New checkout stores only an ID and hashed fingerprint in localStorage. | Cookie and identity tests; browser checks |
| Expired login / auth outage | Checkout refuses expired sessions and auth outages. It never silently downgrades an account purchase to a guest purchase. | Identity tests |
| Price / owner / quantity tampering | Strict allowlisted input, integer and length limits, server catalog lookup, explicit expected-price comparison. One verified server-priced line item. Unknown ownership/amount fields are rejected. | Contract and controller tests |
| Double click / multiple tabs / API replicas | Web Locks serialize browser initialization. PostgreSQL owner advisory locks atomically reserve one active invoice for the same source, SKU and target, even for different client IDs or payment channels. A 60-second recent-paid cooldown prevents immediate duplicate charges. | Controller parallel tests; remote database tests |
| Same ID with different request | Persistent request fingerprint, immutable ownership/amount/reference, database constraints. | Controller and remote database tests |
| Crash / disconnect after provider accepts | Persist reservation first. Only the reservation winner sends once. Ambiguous results remain `unknown`; never automatically resend create. A worker searches Tripay by merchant invoice ID and reads the exact matching transaction; multiple matches require review. | Timeout / lookup recovery tests |
| Concurrent callback / poll / refund | Revision compare-and-set with bounded retries; monotonic state checked again by a database trigger. Stale UNPAID cannot replace PAID; PAID cannot undo REFUND. Failed writes are not acknowledged as success. | Race / refund tests; remote database tests |
| Forged / replayed callback | HMAC over exact raw bytes, constant-time verification, event and schema checks, server-to-server confirmation of reference, SKU subtotal, quantity, channel, amount, fees, and current status. Duplicate/late callbacks do not dispatch fulfillment. | Signature, callback, tampering tests |
| Provider outage | Bounded timeouts and response size, redirects disabled, sanitized errors. Last verified payment status remains visible, marked delayed rather than fabricated as failed/paid. | Transport / outage tests |
| Missing callback | Background reconciliation every 60 seconds, coordinated by 30-second database polling leases. Creating records older than 2 minutes become unknown and are reconciled rather than resent. | Recovery / lease tests |
| Request / email abuse | Atomic database budgets per IP and owner; shared OTP/mailbox budgets; early per-process burst protection. Datastore failure stops sensitive requests. | Abuse tests and 40-way database limiter test |
| Spoofed forwarded IP | Forwarding headers ignored by default; only explicit validated trusted proxy CIDRs may be enabled. | Environment tests |
| Database access from browser | RLS and revoked grants on payment, audit and budget tables; privileged RPCs restricted to service_role. API keys remain server-side. | Remote anonymous-access tests |
| Status tampering / missing history | Database trigger enforces immutable fields, revision and monotonic status. Status/review changes append audit events without raw credentials or customer contact payloads. | Remote database tests |
| CSRF / oversized payload / clickjacking | Explicit allowed Origin on mutations; SameSite cookies; 16 KiB JSON/form body limit; HTTPS deployment guard, no-store and security headers. | Origin/environment tests; HTTP checks |

Legacy sandbox invoices created before HttpOnly sessions retain read access through their old capability. That fallback only applies to records with no account or guest-session owner; it never authorizes a new account-owned invoice. Old sandbox tokens should be retired with sandbox test data before live rollout.

Guest access expires server-side 30 days after invoice creation; legacy capability access expires after 7 days. Changing browser cookie expiry does not bypass those checks. Account-owned invoices use the verified account session instead. Losing a guest cookie does not grant recovery merely by knowing an email or invoice ID; support must verify ownership before any recovery mechanism is introduced.

## Run verification

```powershell
npm.cmd run test --workspace=@anres/api
npm.cmd run typecheck --workspace=@anres/web
npm.cmd audit --omit=dev --audit-level=high
node scripts/test-payment-security.mjs --run
node scripts/test-payment-http-security.mjs --run
```

`test-payment-security.mjs` performs real concurrent RPC requests against the configured Supabase sandbox database. It creates clearly labelled synthetic security-test records and retains their audit history; it never creates provider transactions or dispatches products. It verifies one winner across 12 reservations, atomic rate limits, recovery/polling leases, owner/fingerprint conflicts, immutable fields, forbidden state rollback, audit events, and denied anonymous grants.

`test-payment-http-security.mjs` additionally verifies the running API with a synthetic terminal invoice: HttpOnly guest establishment, correct-owner access, wrong/no/forged session rejection, cross-origin writes, oversized JSON, unsigned callbacks and security headers. It does not require a working VIPayment catalog and never creates a provider payment.

Browser validation of the hardened checkout also sent six parallel requests with different IDs using one guest session. All returned one canonical invoice and one Tripay reference; a second browser context received HTTP 404 for that invoice, and JavaScript could not read the guest cookie. The transaction remained sandbox/UNPAID; this is evidence for creation/ownership/deduplication, not a claim that the live signed PAID/refund callback lifecycle has been tested.

Apply `20261113120000_payment_security.sql` and `20261113130000_payment_recovery_lease.sql` using Supabase SQL Editor. Use the full files in order. Do not run an already applied migration again.

## Required before live rollout

1. Implement and test real fulfillment separately: durable outbox/claim, exact provider destination validation, provider-order idempotency, order-result reconciliation, refunds/disputes, and a manual-review workflow. Payment success alone must never call an unprotected fulfillment endpoint. Current sandbox deliberately has no dispatch path.
2. Test the live merchant configuration and signed paid/refund callbacks end-to-end. Exercise authenticated user A vs B, login/logout/session expiry, guest cookie loss, worker restart, database outage, and provider response loss on the actual hosting. Unit tests cover these ownership decisions, but do not establish that every production auth/deployment setting is correct.
3. Use permanent HTTPS hosting/callback, explicit production origins, same-site API/web cookies, trusted proxy CIDRs restricted to the actual ingress, blocked direct origin access, edge/WAF request caps and bot protection. IP limits alone cannot stop a distributed botnet. Quick tunnels and changing residential IPs are development-only.
4. Configure provider IP allowlists, secret management and rotation, Supabase auth protections/password policy, verified contacts where required, and administrator MFA/least privilege. No secrets may enter client bundles, URLs, analytics, logs, or error responses.
5. Add deployed monitoring/alerts for unknown/review-required payments, worker lag, callback failures, failed database updates, invalid signatures, rate limits, and settlement mismatches. Verify backup restoration and a retention policy for transaction/contact data. Audit events currently share the application database; use an external append-only sink if tamper-resistant operator auditing is required.
6. Review the entire deployed storefront/admin surface and perform an independent penetration test. Frontend CSP currently restricts framing, objects, base URLs and form destinations; a nonce-based script policy and a full XSS review remain additional defense-in-depth work. A dependency audit only reports known advisories at the time it runs.

Sources consulted: [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html), [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [Supabase server auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [Tripay API](https://tripay.co.id/developer).
