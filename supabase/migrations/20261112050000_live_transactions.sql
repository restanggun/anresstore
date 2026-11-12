-- Live transactions are separate from the simulated orders table.
-- Only the API service role may mutate these records.
begin;

create table public.live_transactions (
  id uuid primary key,
  -- Binds a client-generated idempotency key (id) to the validated request.
  request_hash bytea not null check (octet_length(request_hash) = 32),
  user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category text not null check (category in ('game', 'prepaid')),
  provider_code text not null check (length(provider_code) between 1 and 100),
  product_name text not null check (length(product_name) between 1 and 300),
  provider_cost bigint not null check (provider_cost > 0 and provider_cost <= 100000000),
  target text not null check (length(target) between 1 and 200),
  target_zone text check (length(target_zone) <= 100),
  amount bigint not null check (amount > 0 and amount <= 100000000),
  payment_method text not null check (length(payment_method) between 1 and 50),
  payment_reference text unique,
  payment_status text not null default 'creating' check (payment_status in ('creating', 'pending', 'paid', 'failed', 'expired', 'refunded', 'unknown')),
  fulfillment_status text not null default 'not_ready' check (fulfillment_status in ('not_ready', 'ready', 'dispatching', 'processing', 'completed', 'failed', 'unknown', 'manual_review')),
  provider_reference text unique,
  provider_note text,
  payment_total bigint check (payment_total > 0 and payment_total <= 100000000),
  constraint fulfillment_requires_payment check (payment_status in ('paid', 'refunded') or fulfillment_status = 'not_ready')
);

create index live_transactions_user_created_idx on public.live_transactions(user_id, created_at desc);
create index live_transactions_fulfillment_idx on public.live_transactions(fulfillment_status, updated_at);
alter table public.live_transactions enable row level security;
revoke all on public.live_transactions from public, anon, authenticated;
grant select on public.live_transactions to authenticated;
grant select, insert, update on public.live_transactions to service_role;
create policy "Users read own live transactions" on public.live_transactions for select to authenticated using ((select auth.uid()) = user_id);

-- Guest tokens are stored only as SHA-256 digests and never exposed via RLS.
create table public.guest_order_access (
  order_id uuid primary key references public.live_transactions(id) on delete cascade,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.guest_order_access enable row level security;
revoke all on public.guest_order_access from public, anon, authenticated;
grant select, insert, update on public.guest_order_access to service_role;

-- A durable compare-and-set claim prevents two workers from sending the same
-- paid order simultaneously. A dispatching/unknown order is never reclaimed
-- automatically: the provider may have accepted a request whose response was lost.
create function public.claim_live_fulfillment(p_id uuid)
returns setof public.live_transactions
language sql
security invoker
set search_path = ''
as $$
  update public.live_transactions
     set fulfillment_status = 'dispatching', updated_at = now()
   where id = p_id and payment_status = 'paid' and fulfillment_status = 'ready'
  returning *;
$$;
revoke all on function public.claim_live_fulfillment(uuid) from public, anon, authenticated;
grant execute on function public.claim_live_fulfillment(uuid) to service_role;

commit;
