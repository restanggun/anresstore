-- Five service families share server-priced checkout. Manual work is never sent to a supplier.
begin;
alter table public.managed_products drop constraint managed_products_category_check;
alter table public.managed_products add constraint managed_products_category_check check(category in ('game','prepaid','apps','social','tasks'));
alter table public.catalog_promotions drop constraint catalog_promotions_category_check;
alter table public.catalog_promotions add constraint catalog_promotions_category_check check(category in ('game','prepaid','apps','social','tasks'));
alter table public.sandbox_payments drop constraint sandbox_payments_source_check;
alter table public.sandbox_payments add constraint sandbox_payments_source_check check(source in ('game','prepaid','apps','social','tasks'));
alter table public.live_transactions drop constraint live_transactions_category_check;
alter table public.live_transactions add constraint live_transactions_category_check check(category in ('game','prepaid','apps','social','tasks'));
alter table public.admin_roles drop constraint admin_roles_categories_check;
alter table public.admin_roles add constraint admin_roles_categories_check check(categories <@ array['game','prepaid','apps','social','tasks']::text[]);
alter table public.admin_roles drop constraint admin_roles_permissions_check;
alter table public.admin_roles add constraint admin_roles_permissions_check check(permissions <@ array['orders.read','orders.write','payments.read','support.read','support.write','products.read','products.write','customers.read','customers.write']::text[]);
alter table public.managed_products
 add column fulfillment_mode text not null default 'manual' check(fulfillment_mode in ('manual','vipayment')),
 add column supplier_code text check(supplier_code ~ '^[A-Za-z0-9._-]{1,120}$'),
 add column service_quantity integer not null default 1 check(service_quantity between 1 and 10000000);
update public.managed_products set fulfillment_mode='vipayment',supplier_code=provider_code where provider='vipayment';
alter table public.sandbox_payments
 add column fulfillment_mode text not null default 'vipayment' check(fulfillment_mode in ('manual','vipayment')),
 add column provider_service_code text,
 add column service_quantity integer not null default 1 check(service_quantity between 1 and 10000000);
alter table public.live_transactions
 add column fulfillment_mode text not null default 'vipayment' check(fulfillment_mode in ('manual','vipayment')),
 add column service_quantity integer not null default 1 check(service_quantity between 1 and 10000000);
alter table public.live_transactions alter column provider_cost drop not null;
create or replace function public.reserve_sandbox_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; v public.sandbox_payments;
begin
 result:=public.reserve_sandbox_payment_base(p_payment);
 if (result->>'claimed')::boolean then
  update public.sandbox_payments set target_zone=nullif(p_payment->>'target_zone',''),provider_cost=(p_payment->>'provider_cost')::bigint,
   fulfillment_mode=coalesce(p_payment->>'fulfillment_mode','vipayment'),provider_service_code=p_payment->>'provider_service_code',service_quantity=coalesce((p_payment->>'service_quantity')::integer,1)
  where id=(result->'payment'->>'id')::uuid returning * into v;
  return jsonb_build_object('payment',to_jsonb(v),'claimed',true);
 end if;
 return result;
end; $$;
create or replace function public.guard_order_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.provider_cost is not null and old.provider_cost is distinct from new.provider_cost
 or old.target_zone is not null and old.target_zone is distinct from new.target_zone
 or old.provider_service_code is not null and (old.provider_service_code is distinct from new.provider_service_code or old.fulfillment_mode is distinct from new.fulfillment_mode or old.service_quantity is distinct from new.service_quantity)
 then raise exception 'Immutable order metadata'; end if;
 return new;
end; $$;
create or replace function public.project_sandbox_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.live_transactions(id,user_id,request_hash,category,provider_code,product_name,provider_cost,
    target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,payment_mode,review_required,fulfillment_mode,service_quantity)
  values(new.id,new.owner_user_id,decode(new.request_hash,'hex'),new.source,coalesce(new.provider_service_code,new.provider_code),new.product_name,new.provider_cost,
    new.target,new.target_zone,new.amount,new.method,new.reference,new.status,
    case when new.status='paid' then 'ready' else 'not_ready' end,'sandbox',new.review_required,new.fulfillment_mode,new.service_quantity)
  on conflict(id) do update set
    payment_reference=excluded.payment_reference,provider_code=excluded.provider_code,fulfillment_mode=excluded.fulfillment_mode,service_quantity=excluded.service_quantity,payment_status=excluded.payment_status,
    target_zone=excluded.target_zone,provider_cost=excluded.provider_cost,review_required=excluded.review_required,
    fulfillment_status=case
      when excluded.payment_status='refunded' then 'manual_review'
      when excluded.review_required then case when excluded.payment_status='paid' then 'manual_review' else 'not_ready' end
      when excluded.payment_status='paid' and public.live_transactions.fulfillment_status='not_ready' then 'ready'
      else public.live_transactions.fulfillment_status end,
    updated_at=now()
  where public.live_transactions.payment_mode='sandbox';
  if not found then raise exception 'Order mode collision'; end if;
  return new;
end;
$$;

create or replace function public.claim_live_fulfillment(p_id uuid)
returns setof public.live_transactions language sql security invoker set search_path='' as $$
 update public.live_transactions set fulfillment_status='dispatching',updated_at=now()
 where id=p_id and payment_status='paid' and fulfillment_status='ready' and payment_mode='live' and fulfillment_mode='vipayment' and not review_required
 and payment_reference is not null and length(payment_reference)>0 and provider_reference is null returning *;
$$;
commit;
