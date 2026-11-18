begin;

-- One row per checkout, including legacy live orders and imported sales.
-- Task specs and gateway fulfillment extend a payment; they are not new sales.
create view public.admin_transaction_records with (security_invoker = true) as
select coalesce(p.id,t.id)::text as id,
  coalesce(p.invoice_number,t.invoice_number) as invoice_number,
  coalesce(p.created_at,t.created_at) as created_at,
  coalesce(t.updated_at,p.updated_at) as updated_at,
  coalesce(p.source,t.category) as category,
  coalesce(p.product_name,t.product_name) as product_name,
  coalesce(t.provider_code,p.provider_code) as provider_code,
  coalesce(p.target,t.target) as target,
  coalesce(p.target_zone,t.target_zone) as target_zone,
  coalesce(p.amount,t.amount) as amount,
  coalesce(p.method,t.payment_method) as payment_method,
  coalesce(p.reference,t.payment_reference) as payment_reference,
  coalesce(p.status,t.payment_status) as payment_status,
  coalesce(s.workflow_status,t.fulfillment_status,'not_ready') as fulfillment_status,
  t.provider_reference,t.provider_note,
  coalesce(p.payment_mode,t.payment_mode) as payment_mode,
  coalesce(t.review_required,p.review_required,false) as review_required,
  coalesce(t.fulfillment_mode,p.fulfillment_mode) as fulfillment_mode,
  coalesce(p.service_quantity,t.service_quantity) as service_quantity,
  coalesce(p.customer_name,t.customer_name) as customer_name,
  coalesce(p.customer_email,t.customer_email) as customer_email,
  coalesce(p.customer_phone,t.customer_phone) as customer_phone,
  case when s.payment_id is not null then 'task' end as manual_kind,
  'checkout'::text as source,
  coalesce(p.cost_price,p.provider_cost,t.provider_cost) as accounting_cost
from public.payments p
full join public.live_transactions t on t.id=p.id
left join public.task_order_specs s on s.payment_id=p.id
where coalesce(p.payment_mode,t.payment_mode)='live'
union all
select o.id::text,o.invoice_number,o.created_at,o.updated_at,'apps',o.product_name,'premium',
  'Aplikasi premium',null,o.amount,'QRIS',null,
  case when o.status in ('paid','delivered','closed') then 'paid'
       when o.status='cancelled' then 'cancelled' else 'pending' end,
  case when o.status in ('delivered','closed') then 'completed'
       when o.status='paid' then 'ready'
       when o.status='proof_submitted' then 'manual_review'
       else o.status end,
  null,null,o.payment_mode,o.status='proof_submitted','manual',1,null,o.customer_email,o.customer_phone,
  'premium','premium',null
from public.premium_orders o where o.payment_mode='live'
union all
select 'historical-'||h.id,null,h.sale_date::timestamp at time zone 'Asia/Jakarta',null,'apps',
  h.product_name,'QRIS',h.variant_description,null,h.amount,upper(h.payment_method),null,
  'paid','historical',null,null,'live',false,null,h.quantity,null,null,null,
  null,'historical',null
from public.historical_sales h;

revoke all on public.admin_transaction_records from public,anon,authenticated;
grant select on public.admin_transaction_records to service_role;

create function public.admin_list_transactions(p_view text,p_status text,p_search text,p_page integer)
returns setof public.admin_transaction_records
language sql stable security invoker set search_path='' as $$
  select r.* from public.admin_transaction_records r
  where p_view in ('orders','payments','fulfillment')
    and (p_view <> 'fulfillment' or (r.source <> 'historical'
      and (r.payment_status in ('paid','refunded') or r.review_required
        or r.fulfillment_status in ('failed','unknown','manual_review'))))
    and case p_status
      when 'all' then true
      when 'active' then r.payment_status='paid' and r.fulfillment_status in
        ('ready','dispatching','processing','queued','working','delivered','revision_requested','revision_working')
      when 'pending' then r.payment_status in ('creating','pending')
      when 'paid' then r.payment_status='paid'
      when 'failed' then r.payment_status in ('failed','expired','cancelled')
      when 'refunded' then r.payment_status='refunded'
      when 'unknown' then r.payment_status='unknown'
      when 'review' then r.review_required or r.fulfillment_status in ('failed','unknown','manual_review')
      when 'completed' then r.fulfillment_status='completed'
      else false end
    and (p_search='' or strpos(lower(concat_ws(' ',r.invoice_number,r.product_name,r.target,
      r.provider_code,r.payment_reference)),lower(p_search))>0)
  order by r.created_at desc,r.source,r.id
  limit 51 offset (p_page * 50);
$$;
revoke all on function public.admin_list_transactions(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_list_transactions(text,text,text,integer) to service_role;

create or replace function public.admin_transaction_analytics(p_days integer)
returns table(summary jsonb,daily jsonb,statuses jsonb,products jsonb)
language sql stable security invoker set search_path='' as $$
  with bounds as (
    select (now() at time zone 'Asia/Jakarta')::date as today
    where p_days in (7,30,90)
  ), transactions as (
    select r.product_name,r.amount,r.accounting_cost,r.payment_status,r.fulfillment_status,r.source,
      (r.created_at at time zone 'Asia/Jakarta')::date as day
    from public.admin_transaction_records r cross join bounds b
    where r.created_at >= ((b.today-(p_days-1))::timestamp at time zone 'Asia/Jakarta')
      and r.created_at < ((b.today+1)::timestamp at time zone 'Asia/Jakarta')
  ), dates as (
    select b.today-n as day from bounds b cross join generate_series(0,p_days-1) n
  ), daily_rows as (
    select d.day,count(t.day) orders,
      count(*) filter(where t.payment_status='paid') paid_count,
      count(*) filter(where t.payment_status in ('creating','pending')) pending_count,
      count(*) filter(where t.payment_status in ('failed','expired','cancelled')) failed_count,
      count(*) filter(where t.payment_status='refunded') refunded_count,
      count(*) filter(where t.payment_status='unknown') unknown_count,
      coalesce(sum(t.amount) filter(where t.payment_status='paid'),0) paid,
      coalesce(sum(t.accounting_cost) filter(where t.payment_status='paid'),0) cost,
      coalesce(sum(t.amount-t.accounting_cost) filter(where t.payment_status='paid'),0) profit
    from dates d left join transactions t using(day) group by d.day
  ), status_rows as (
    select fulfillment_status name,count(*) value from transactions group by fulfillment_status
  ), product_rows as (
    -- Checkout and premium snapshots use "product - variant"; imported sales already contain the product.
    select split_part(product_name,' - ',1) name,count(*) value,sum(amount) amount
    from transactions where payment_status='paid'
    group by 1 order by value desc,amount desc,name limit 8
  )
  select jsonb_build_object(
    'orders',coalesce(sum(orders),0),'paidCount',coalesce(sum(paid_count),0),
    'pendingCount',coalesce(sum(pending_count),0),'failedCount',coalesce(sum(failed_count),0),
    'refundedCount',coalesce(sum(refunded_count),0),'unknownCount',coalesce(sum(unknown_count),0),
    'paidAmount',coalesce(sum(paid),0),'costAmount',coalesce(sum(cost),0),'profitAmount',coalesce(sum(profit),0),
    'historicalCount',(select count(*) from transactions where source='historical'),
    'unknownCostCount',(select count(*) from transactions where payment_status='paid' and accounting_cost is null),
    'completed',(select count(*) from transactions where fulfillment_status='completed'),
    'needsReview',(select count(*) from public.admin_transaction_records
      where review_required or fulfillment_status in ('failed','unknown','manual_review'))
  ),
  coalesce(jsonb_agg(jsonb_build_object('date',day,'orders',orders,'paidCount',paid_count,
    'pendingCount',pending_count,'failedCount',failed_count,'refundedCount',refunded_count,
    'unknownCount',unknown_count,'paid',paid,'cost',cost,'profit',profit) order by day),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc,name)
    from status_rows),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value,'amount',amount) order by value desc,amount desc,name)
    from product_rows),'[]'::jsonb)
  from daily_rows;
$$;

notify pgrst, 'reload schema';
commit;
