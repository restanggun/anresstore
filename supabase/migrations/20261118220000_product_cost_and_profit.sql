begin;
alter table public.managed_products add column cost_price bigint check (cost_price between 0 and 100000000);
alter table public.payments add column cost_price bigint check (cost_price between 0 and 100000000);

create function public.snapshot_product_cost() returns trigger
language plpgsql security invoker set search_path='' as $$
declare managed_cost bigint;
begin
  if new.payment_mode = 'live' then
    if new.provider_code ~ '^managed\.[0-9a-fA-F-]{36}$' then
      select p.cost_price into managed_cost from public.managed_products p
      where p.id = substring(new.provider_code from 9)::uuid and p.category = new.source;
    else
      select p.cost_price into managed_cost from public.managed_products p
      where p.provider = 'vipayment' and p.provider_code = new.provider_code and p.category = new.source;
    end if;
    new.cost_price := coalesce(managed_cost, new.provider_cost);
  end if;
  return new;
end; $$;
create trigger snapshot_product_cost_before_insert before insert on public.payments
for each row execute function public.snapshot_product_cost();
revoke all on function public.snapshot_product_cost() from public,anon,authenticated;
grant execute on function public.snapshot_product_cost() to service_role;

create or replace function public.admin_transaction_analytics(p_days integer)
returns table(summary jsonb,daily jsonb,statuses jsonb,products jsonb)
language sql stable security invoker set search_path='' as $$
 with transactions as (
  select t.*, coalesce(p.cost_price,t.provider_cost) as accounting_cost,
    (t.created_at at time zone 'Asia/Jakarta')::date as day
  from public.live_transactions t
  left join public.payments p on p.id=t.id
  where p_days in (7,30,90) and t.payment_mode='live' and t.created_at >= (((now() at time zone 'Asia/Jakarta')::date-(p_days-1))::timestamp at time zone 'Asia/Jakarta')
 ), dates as (select generate_series((now() at time zone 'Asia/Jakarta')::date-(p_days-1),(now() at time zone 'Asia/Jakarta')::date,'1 day')::date as day),
 daily_rows as (select d.day,count(t.id) orders,coalesce(sum(t.amount) filter(where t.payment_status='paid'),0) paid,
   coalesce(sum(t.accounting_cost) filter(where t.payment_status='paid'),0) cost,
   coalesce(sum(t.amount-t.accounting_cost) filter(where t.payment_status='paid' and t.accounting_cost is not null),0) profit
   from dates d left join transactions t using(day) group by d.day),
 status_rows as (select fulfillment_status name,count(*) value from transactions group by fulfillment_status),
 product_rows as (select product_name name,count(*) value from transactions where payment_status='paid' group by product_name order by value desc,product_name limit 8)
 select
 jsonb_build_object('orders',(select count(*) from transactions),'paidAmount',(select coalesce(sum(amount),0) from transactions where payment_status='paid'),
   'costAmount',(select coalesce(sum(accounting_cost),0) from transactions where payment_status='paid'),
   'profitAmount',(select coalesce(sum(amount-accounting_cost),0) from transactions where payment_status='paid' and accounting_cost is not null),
   'unknownCostCount',(select count(*) from transactions where payment_status='paid' and accounting_cost is null),
   'completed',(select count(*) from transactions where fulfillment_status='completed'),
   'needsReview',(select count(*) from public.live_transactions where payment_mode='live' and fulfillment_status in ('failed','unknown','manual_review'))),
 coalesce((select jsonb_agg(jsonb_build_object('date',day,'orders',orders,'paid',paid,'cost',cost,'profit',profit) order by day) from daily_rows),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value) order by name) from status_rows),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc,name) from product_rows),'[]'::jsonb);
$$;
commit;
