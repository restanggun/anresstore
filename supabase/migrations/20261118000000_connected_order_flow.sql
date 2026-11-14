-- Apply after 20261117000000_fulfillment_guard.sql. Run the entire file once.
begin;
alter table public.sandbox_payments
  add column target_zone text check (target_zone is null or target_zone ~ '^[A-Za-z0-9_-]{1,100}$'),
  add column provider_cost bigint check (provider_cost > 0 and provider_cost <= 100000000);
alter table public.live_transactions
  add column payment_mode text not null default 'live' check (payment_mode in ('live','sandbox')),
  add column review_required boolean not null default false;

-- Preserve the atomic reservation and its owner lock. Metadata is written in
-- the same transaction, only by the winner; retries cannot replace it.
alter function public.reserve_sandbox_payment(jsonb) rename to reserve_sandbox_payment_base;
create function public.reserve_sandbox_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; v public.sandbox_payments;
begin
  result := public.reserve_sandbox_payment_base(p_payment);
  if (result->>'claimed')::boolean then
    update public.sandbox_payments set
      target_zone = nullif(p_payment->>'target_zone',''),
      provider_cost = (p_payment->>'provider_cost')::bigint
    where id = (result->'payment'->>'id')::uuid returning * into v;
    return jsonb_build_object('payment',to_jsonb(v),'claimed',true);
  end if;
  return result;
end;
$$;
revoke all on function public.reserve_sandbox_payment(jsonb) from public,anon,authenticated;
grant execute on function public.reserve_sandbox_payment(jsonb) to service_role;

create function public.project_sandbox_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.live_transactions(id,request_hash,category,provider_code,product_name,provider_cost,
    target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,payment_mode,review_required)
  values(new.id,decode(new.request_hash,'hex'),new.source,new.provider_code,new.product_name,coalesce(new.provider_cost,new.amount),
    new.target,new.target_zone,new.amount,new.method,new.reference,new.status,
    case when new.status='paid' then 'ready' else 'not_ready' end,'sandbox',new.review_required)
  on conflict(id) do update set
    payment_reference=excluded.payment_reference,payment_status=excluded.payment_status,
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
create trigger project_sandbox_order after insert or update on public.sandbox_payments
  for each row execute function public.project_sandbox_order();
revoke all on function public.project_sandbox_order() from public,anon,authenticated;
grant execute on function public.project_sandbox_order() to service_role;

create function public.guard_order_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.provider_cost is not null and old.provider_cost is distinct from new.provider_cost
    or old.target_zone is not null and old.target_zone is distinct from new.target_zone then
    raise exception 'Immutable order metadata';
  end if;
  return new;
end;
$$;
create trigger guard_order_metadata before update on public.sandbox_payments for each row execute function public.guard_order_metadata();
revoke all on function public.guard_order_metadata() from public,anon,authenticated;
grant execute on function public.guard_order_metadata() to service_role;

create or replace function public.claim_live_fulfillment(p_id uuid)
returns setof public.live_transactions language sql security invoker set search_path = '' as $$
  update public.live_transactions set fulfillment_status='dispatching',updated_at=now()
  where id=p_id and payment_status='paid' and fulfillment_status='ready'
    and payment_mode='live' and not review_required
    and payment_reference is not null and length(payment_reference)>0 and provider_reference is null
  returning *;
$$;
-- Dry-run fulfillment uses no provider and never assigns a real provider reference.
create function public.advance_sandbox_fulfillment() returns void
language sql security invoker set search_path = '' as $$
  update public.live_transactions set fulfillment_status='completed',
    provider_note='Simulasi selesai. Tidak ada produk yang dibeli atau dikirim melalui VIPayment.',updated_at=now()
  where payment_mode='sandbox' and payment_status='paid' and fulfillment_status='processing' and not review_required;
  update public.live_transactions set fulfillment_status='processing',updated_at=now()
  where payment_mode='sandbox' and payment_status='paid' and fulfillment_status='ready' and not review_required;
$$;
revoke all on function public.advance_sandbox_fulfillment() from public,anon,authenticated;
grant execute on function public.advance_sandbox_fulfillment() to service_role;
-- Backfill existing invoices through the same projection without altering payment state.
update public.sandbox_payments set updated_at=updated_at;
commit;
