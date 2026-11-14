begin;
alter table public.admin_roles drop constraint admin_roles_permissions_check;
alter table public.admin_roles add constraint admin_roles_permissions_check check(permissions <@ array['orders.read','payments.read','support.read','support.write','products.read','products.write','customers.read','customers.write']::text[]);
create function public.admin_transaction_analytics(p_days integer)
returns table(summary jsonb,daily jsonb,statuses jsonb,products jsonb)
language sql stable security invoker set search_path='' as $$
 with transactions as (
  select *, (created_at at time zone 'Asia/Jakarta')::date as day
  from public.live_transactions
  where p_days in (7,30,90) and payment_mode='live' and created_at >= (((now() at time zone 'Asia/Jakarta')::date-(p_days-1))::timestamp at time zone 'Asia/Jakarta')
 ), dates as (select generate_series((now() at time zone 'Asia/Jakarta')::date-(p_days-1),(now() at time zone 'Asia/Jakarta')::date,'1 day')::date as day),
 daily_rows as (select d.day,count(t.id) orders,coalesce(sum(t.amount) filter(where t.payment_status='paid'),0) paid from dates d left join transactions t using(day) group by d.day),
 status_rows as (select fulfillment_status name,count(*) value from transactions group by fulfillment_status),
 product_rows as (select product_name name,count(*) value from transactions where payment_status='paid' group by product_name order by value desc,product_name limit 8)
 select
 jsonb_build_object('orders',(select count(*) from transactions),'paidAmount',(select coalesce(sum(amount),0) from transactions where payment_status='paid'),'completed',(select count(*) from transactions where fulfillment_status='completed'),'needsReview',(select count(*) from public.live_transactions where payment_mode='live' and fulfillment_status in ('failed','unknown','manual_review'))),
 coalesce((select jsonb_agg(jsonb_build_object('date',day,'orders',orders,'paid',paid) order by day) from daily_rows),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value) order by name) from status_rows),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc,name) from product_rows),'[]'::jsonb);
$$;
revoke all on function public.admin_transaction_analytics(integer) from public,anon,authenticated;
grant execute on function public.admin_transaction_analytics(integer) to service_role;
commit;
