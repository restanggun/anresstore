-- The historical table name is retained to avoid breaking invoices during cutover.
-- Both modes use the same authoritative reservation/payment pipeline.
begin;
alter table public.sandbox_payments add column payment_mode text not null default 'sandbox'
  check (payment_mode in ('sandbox','live'));
create index payment_mode_reconcile_idx on public.sandbox_payments(payment_mode,status,provider_check_until);

create function public.guard_payment_mode() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.payment_mode is distinct from new.payment_mode then
    raise exception 'Immutable payment mode' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger guard_payment_mode before update on public.sandbox_payments
for each row execute function public.guard_payment_mode();

create function public.reserve_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.sandbox_payments; v_owner text; v_mode text;
begin
  v := jsonb_populate_record(null::public.sandbox_payments,p_payment);
  v_mode := p_payment->>'payment_mode';
  v_owner := coalesce(v.owner_user_id::text,v.guest_session_hash);
  if v_mode is null or v_mode not in ('sandbox','live') or v_owner is null or v.checkout_hash is null
    or v.request_hash is null or v.access_hash is null
    or (v.owner_user_id is not null and v.guest_session_hash is not null) then
    raise exception 'Invalid payment reservation' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner,0));
  select * into v from public.sandbox_payments where id=(p_payment->>'id')::uuid for update;
  if found then
    if coalesce(v.owner_user_id::text,v.guest_session_hash) is distinct from v_owner
      or v.request_hash is distinct from p_payment->>'request_hash' or v.payment_mode <> v_mode then
      raise exception 'Payment intent conflict' using errcode='23505';
    end if;
    return jsonb_build_object('payment',to_jsonb(v),'claimed',false);
  end if;
  select * into v from public.sandbox_payments
    where coalesce(owner_user_id::text,guest_session_hash)=v_owner and payment_mode=v_mode
      and checkout_hash=p_payment->>'checkout_hash'
      and (status in ('creating','pending','unknown') or (status='paid' and created_at>now()-interval '60 seconds'))
    order by created_at desc limit 1 for update;
  if found then return jsonb_build_object('payment',to_jsonb(v),'claimed',false); end if;
  insert into public.sandbox_payments(id,access_hash,request_hash,source,product_name,provider_code,target,target_zone,
    amount,method,owner_user_id,guest_session_hash,checkout_hash,payment_mode,provider_cost,
    fulfillment_mode,provider_service_code,service_quantity,customer_name,customer_email,customer_phone)
  values((p_payment->>'id')::uuid,p_payment->>'access_hash',p_payment->>'request_hash',p_payment->>'source',
    p_payment->>'product_name',p_payment->>'provider_code',p_payment->>'target',nullif(p_payment->>'target_zone',''),
    (p_payment->>'amount')::bigint,p_payment->>'method',(p_payment->>'owner_user_id')::uuid,
    p_payment->>'guest_session_hash',p_payment->>'checkout_hash',v_mode,(p_payment->>'provider_cost')::bigint,
    p_payment->>'fulfillment_mode',p_payment->>'provider_service_code',coalesce((p_payment->>'service_quantity')::integer,1),
    p_payment->>'customer_name',p_payment->>'customer_email',p_payment->>'customer_phone')
  returning * into v;
  return jsonb_build_object('payment',to_jsonb(v),'claimed',true);
end; $$;

create or replace function public.project_sandbox_order() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.live_transactions(id,user_id,request_hash,category,provider_code,product_name,provider_cost,
    target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,
    payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone)
  values(new.id,new.owner_user_id,decode(new.request_hash,'hex'),new.source,
    coalesce(new.provider_service_code,new.provider_code),new.product_name,new.provider_cost,new.target,new.target_zone,
    new.amount,new.method,new.reference,new.status,
    case when new.review_required and new.status='paid' then 'manual_review'
         when new.status='paid' then 'ready' else 'not_ready' end,
    new.payment_mode,new.review_required,new.fulfillment_mode,new.service_quantity,new.customer_name,new.customer_email,new.customer_phone)
  on conflict(id) do update set payment_reference=excluded.payment_reference,
    payment_status=excluded.payment_status,review_required=excluded.review_required,
    fulfillment_status=case when excluded.payment_status='refunded' then 'manual_review'
      when excluded.review_required and excluded.payment_status='paid' then 'manual_review'
      when excluded.payment_status='paid' and public.live_transactions.fulfillment_status='not_ready' then 'ready'
      else public.live_transactions.fulfillment_status end,updated_at=now()
  where public.live_transactions.payment_mode=excluded.payment_mode;
  if not found then raise exception 'Order mode collision'; end if;
  return new;
end; $$;

-- Old API versions can still reserve sandbox invoices, never live ones.
create or replace function public.reserve_sandbox_payment(p_payment jsonb) returns jsonb
language sql security invoker set search_path='' as $$
  select public.reserve_payment(p_payment || '{"payment_mode":"sandbox"}'::jsonb);
$$;
-- Stop automatic success transitions, including calls from old API replicas.
create or replace function public.advance_sandbox_fulfillment() returns void
language plpgsql security invoker set search_path='' as $$
begin return; end; $$;

revoke all on function public.guard_payment_mode(),public.reserve_payment(jsonb) from public,anon,authenticated;
grant execute on function public.guard_payment_mode(),public.reserve_payment(jsonb) to service_role;
-- Archived client-priced orders are readable by their owners, but cannot be created.
revoke insert on public.orders from authenticated;
drop policy if exists "Users create own orders" on public.orders;
commit;
