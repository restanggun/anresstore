-- Reconcile older deployments with the original live transaction schema.
-- Missing required values on existing rows intentionally abort this transaction.
begin;
alter table public.live_transactions
  add column if not exists request_hash bytea not null check (octet_length(request_hash) = 32),
  add column if not exists provider_cost bigint not null check (provider_cost > 0 and provider_cost <= 100000000);
alter table public.live_transactions alter column user_id drop not null;
commit;
