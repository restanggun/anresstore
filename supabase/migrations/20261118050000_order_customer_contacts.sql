begin;
alter table public.sandbox_payments add column customer_name text check(char_length(customer_name)<=100), add column customer_email text check(char_length(customer_email)<=254), add column customer_phone text check(char_length(customer_phone)<=16);
alter table public.live_transactions add column customer_name text check(char_length(customer_name)<=100), add column customer_email text check(char_length(customer_email)<=254), add column customer_phone text check(char_length(customer_phone)<=16);
create or replace function public.reserve_sandbox_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; v public.sandbox_payments;
begin
 result:=public.reserve_sandbox_payment_base(p_payment);
 if (result->>'claimed')::boolean then
  update public.sandbox_payments set target_zone=nullif(p_payment->>'target_zone',''),provider_cost=(p_payment->>'provider_cost')::bigint,
   customer_name=p_payment->>'customer_name',customer_email=p_payment->>'customer_email',customer_phone=p_payment->>'customer_phone',
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
 or old.customer_email is not null and (old.customer_name is distinct from new.customer_name or old.customer_email is distinct from new.customer_email or old.customer_phone is distinct from new.customer_phone)
 or old.provider_service_code is not null and (old.provider_service_code is distinct from new.provider_service_code or old.fulfillment_mode is distinct from new.fulfillment_mode or old.service_quantity is distinct from new.service_quantity)
 then raise exception 'Immutable order metadata'; end if;
 return new;
end; $$;
create or replace function public.project_sandbox_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.live_transactions(id,user_id,request_hash,category,provider_code,product_name,provider_cost,
    target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone)
  values(new.id,new.owner_user_id,decode(new.request_hash,'hex'),new.source,coalesce(new.provider_service_code,new.provider_code),new.product_name,new.provider_cost,
    new.target,new.target_zone,new.amount,new.method,new.reference,new.status,
    case when new.status='paid' then 'ready' else 'not_ready' end,'sandbox',new.review_required,new.fulfillment_mode,new.service_quantity,new.customer_name,new.customer_email,new.customer_phone)
  on conflict(id) do update set
    payment_reference=excluded.payment_reference,customer_name=excluded.customer_name,customer_email=excluded.customer_email,customer_phone=excluded.customer_phone,provider_code=excluded.provider_code,fulfillment_mode=excluded.fulfillment_mode,service_quantity=excluded.service_quantity,payment_status=excluded.payment_status,
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


commit;
