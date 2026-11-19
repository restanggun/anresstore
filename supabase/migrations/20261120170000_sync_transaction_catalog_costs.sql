begin;

create table public.premium_order_costs (
  order_id uuid primary key references public.premium_orders(id) on delete cascade,
  cost_price bigint not null check (cost_price between 0 and 100000000)
);
alter table public.premium_order_costs enable row level security;
revoke all on public.premium_order_costs from public,anon,authenticated;
grant select,insert on public.premium_order_costs to service_role;

create function public.snapshot_premium_order_cost() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.premium_order_costs(order_id,cost_price)
  select new.id,m.cost_price from public.managed_products m
  where m.id=new.product_id and m.cost_price is not null;
  return new;
end; $$;
create trigger snapshot_premium_order_cost_after_insert after insert on public.premium_orders
for each row execute function public.snapshot_premium_order_cost();
revoke all on function public.snapshot_premium_order_cost() from public,anon,authenticated;
grant execute on function public.snapshot_premium_order_cost() to service_role;

-- Use order-time costs first. For missing costs, resolve exactly one catalog variant.
create or replace view public.admin_transaction_records with (security_invoker = true) as
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
  coalesce(p.cost_price,p.provider_cost,t.provider_cost,managed.cost_price,legacy.cost_price) as accounting_cost
from public.payments p
full join public.live_transactions t on t.id=p.id
left join public.task_order_specs s on s.payment_id=p.id
left join public.managed_products managed on managed.category=p.source
  and managed.id=case when p.provider_code ~ '^managed\.[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    then substring(p.provider_code from 9)::uuid end
left join public.managed_products legacy on legacy.category=coalesce(p.source,t.category)
  and legacy.provider='vipayment' and legacy.provider_code=coalesce(p.provider_code,t.provider_code)
  and managed.id is null
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
  'premium','premium',coalesce(snapshot.cost_price,premium.cost_price)
from public.premium_orders o
left join public.premium_order_costs snapshot on snapshot.order_id=o.id
left join public.managed_products premium on premium.id=o.product_id
where o.payment_mode='live'
union all
select 'historical-'||h.id,null,h.sale_date::timestamp at time zone 'Asia/Jakarta',null,'apps',
  h.product_name,'QRIS',h.variant_description,null,h.amount,upper(h.payment_method),null,
  'paid','historical',null,null,'live',false,null,h.quantity,null,null,null,
  null,'historical',matched.cost_price * h.quantity
from public.historical_sales h
left join lateral (
  select min(m.cost_price) as cost_price
  from public.managed_products m
  where m.category='apps' and m.deleted_at is null
    and lower(btrim(m.product))=lower(btrim(h.product_name))
    and btrim(regexp_replace(lower(m.name),'[^[:alnum:]]+',' ','g')) =
        btrim(regexp_replace(lower(h.variant_description),'[^[:alnum:]]+',' ','g'))
  having count(*)=1
) matched on true;

notify pgrst, 'reload schema';
commit;
