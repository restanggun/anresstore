-- Sandbox records remain isolated from live fulfillment and simulated orders.
begin;
create table public.sandbox_payments (
  id uuid primary key,
  access_hash text not null check (length(access_hash) = 64),
  request_hash text not null check (length(request_hash) = 64),
  created_at timestamptz not null default now(),
  source text not null check (source in ('game', 'prepaid', 'apps')),
  product_name text not null,
  provider_code text not null,
  target text not null,
  amount bigint not null check (amount > 0 and amount <= 100000000),
  method text not null,
  reference text unique,
  status text not null default 'creating' check (status in ('creating','pending','paid','failed','expired','refunded','unknown')),
  details jsonb,
  updated_at timestamptz not null default now()
);
alter table public.sandbox_payments enable row level security;
revoke all on public.sandbox_payments from public, anon, authenticated;
grant select, insert, update on public.sandbox_payments to service_role;
commit;
