begin;
-- Shared across replicas. Reservations remain charged even if the response is lost.
create table public.fulfillment_limits (
  id boolean primary key default true check(id),
  paused boolean not null default false,
  max_order_cost bigint not null default 250000 check(max_order_cost > 0),
  max_hour_cost bigint not null default 500000 check(max_hour_cost > 0),
  max_day_cost bigint not null default 2000000 check(max_day_cost > 0),
  max_hour_orders integer not null default 10 check(max_hour_orders > 0)
);
insert into public.fulfillment_limits(id) values(true);
create table public.fulfillment_spend_reservations (
  order_id uuid primary key references public.live_transactions(id),
  cost bigint not null check(cost > 0),
  reserved_at timestamptz not null default clock_timestamp()
);
create index fulfillment_spend_time_idx on public.fulfillment_spend_reservations(reserved_at);
-- Account for orders already dispatched before this migration.
insert into public.fulfillment_spend_reservations(order_id,cost,reserved_at)
select id,provider_cost,created_at from public.live_transactions
where payment_mode='live' and fulfillment_mode='vipayment' and provider_cost>0
  and (provider_reference is not null or fulfillment_status in ('dispatching','processing','completed','unknown','failed','manual_review'));
alter table public.fulfillment_limits enable row level security;
alter table public.fulfillment_spend_reservations enable row level security;
revoke all on public.fulfillment_limits, public.fulfillment_spend_reservations from public,anon,authenticated;
grant select,update on public.fulfillment_limits to service_role;
grant select,insert on public.fulfillment_spend_reservations to service_role;

create or replace function public.claim_live_fulfillment(p_id uuid)
returns setof public.live_transactions language plpgsql security invoker set search_path='' as $$
declare lim public.fulfillment_limits; candidate public.live_transactions;
  hour_cost bigint; day_cost bigint; hour_orders bigint; cutoff timestamptz;
begin
  -- Lock the singleton before reading totals: parallel workers cannot overspend.
  select * into lim from public.fulfillment_limits where id=true for update;
  if not found or lim.paused then return; end if;
  cutoff := clock_timestamp();
  select * into candidate from public.live_transactions where id=p_id for update;
  if not found or candidate.payment_status <> 'paid' or candidate.fulfillment_status <> 'ready'
    or candidate.payment_mode <> 'live' or candidate.fulfillment_mode <> 'vipayment'
    or candidate.review_required or candidate.payment_reference is null or length(candidate.payment_reference)=0
    or candidate.provider_reference is not null then return; end if;
  if exists(select 1 from public.fulfillment_spend_reservations where order_id=p_id) then return; end if;
  select coalesce(sum(cost) filter(where reserved_at>cutoff-interval '1 hour'),0),
    coalesce(sum(cost),0),count(*) filter(where reserved_at>cutoff-interval '1 hour')
    into hour_cost,day_cost,hour_orders from public.fulfillment_spend_reservations
    where reserved_at>cutoff-interval '24 hours';
  if candidate.provider_cost is null or candidate.provider_cost<=0
    or candidate.provider_cost>lim.max_order_cost or hour_cost+candidate.provider_cost>lim.max_hour_cost
    or day_cost+candidate.provider_cost>lim.max_day_cost or hour_orders>=lim.max_hour_orders then
    update public.live_transactions set review_required=true,updated_at=clock_timestamp() where id=p_id;
    return;
  end if;
  insert into public.fulfillment_spend_reservations(order_id,cost) values(p_id,candidate.provider_cost);
  return query update public.live_transactions set fulfillment_status='dispatching',updated_at=clock_timestamp()
    where id=p_id returning *;
end; $$;
revoke all on function public.claim_live_fulfillment(uuid) from public,anon,authenticated;
grant execute on function public.claim_live_fulfillment(uuid) to service_role;
commit;
