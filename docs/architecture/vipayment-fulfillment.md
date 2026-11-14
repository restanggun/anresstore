# VIPayment fulfillment integration

The catalog uses production VIPayment. Tripay payments still use sandbox and
must never create production product orders. `FulfillmentWorker` reads only
`live_transactions`; it does not read, copy, or dispatch `sandbox_payments`.

## Implemented

- Server-side VIPayment order and status transport for game, prepaid and apps.
- Separate `data_no` and `data_zone`; no guessing a zone from a combined string.
- Exact reference, destination, zone, cost, and prepaid SKU verification.
- Single durable claim before sending; no automatic retry of order POSTs.
- Lost responses and stale dispatch claims become `unknown`, requiring review.
- Processing orders are polled; terminal status writes compare the previous state.
- Admin `GET /v1/admin/records/fulfillment` requires `orders.read`, MFA and all-service scope.
- Disabled by default with `VIPAYMENT_FULFILLMENT_ENABLED=false`.

Apply `20261117000000_fulfillment_guard.sql` before enabling the worker.
The migration has not been applied by this implementation task.

## Remaining integration requirements

This is not a production-readiness certification. The current checkout writes
only sandbox payment rows. There is intentionally no bridge that labels those
rows as real paid orders. A future live payment integration must atomically
persist a server-priced order, verified payment reference, provider cost and
separate validated destination/zone before setting fulfillment to `ready`.
The current storefront's combined game ID/server field must be replaced before
it can produce these live orders. The new migration extends the live table's
category constraint to include apps alongside game and prepaid.

The worker does not issue customer refunds. Provider `error` means fulfillment
failed, not that the buyer has been refunded. Operators must reconcile unknown
orders in VIPayment before any replacement order, especially if a process died
between provider acceptance and saving its reference. Do not reset an unknown
order to ready without independently verifying that no provider order exists.

Tests use mocked provider and database responses. They neither spend VIPayment
balance nor prove production IP allowlists, credentials or deployed migrations.

Provider contracts: https://vip-reseller.co.id/page/api/game-feature and
https://vip-reseller.co.id/page/api/prepaid (reviewed during implementation).
