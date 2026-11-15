begin;
-- UUIDs stay relational keys. Public numbers are immutable database-owned snapshots.
alter table public.sandbox_payments add column invoice_number text,
  add column invoice_product_code text, add column invoice_subproduct_code text, add column merchant_ref text;
alter table public.live_transactions add column invoice_number text;

create function public.invoice_code_part(value text) returns text
language sql immutable set search_path='' as $$
  select coalesce(nullif(left(regexp_replace(upper(coalesce(value,'')), '[^A-Z0-9]', '', 'g'),12),''),'ITEM');
$$;
create function public.make_invoice_number(subproduct text, product text, issued_at timestamptz) returns text
language sql volatile set search_path='' as $$
  select 'ARNS-' || public.invoice_code_part(subproduct) || '-' || public.invoice_code_part(product)
    || '-' || to_char(issued_at at time zone 'Asia/Bangkok','YYYYMMDD')
    || '-' || upper(left(replace(gen_random_uuid()::text,'-',''),16));
$$;
-- Never change the merchant reference of an already-sent or ambiguous gateway request.
update public.sandbox_payments set
  invoice_product_code=public.invoice_code_part(split_part(product_name,' - ',1)),
  invoice_subproduct_code=public.invoice_code_part(provider_code),
  invoice_number=public.make_invoice_number(provider_code,split_part(product_name,' - ',1),created_at), merchant_ref=id::text;
update public.live_transactions t set invoice_number=p.invoice_number from public.sandbox_payments p where p.id=t.id;
update public.live_transactions set invoice_number=public.make_invoice_number(provider_code,product_name,created_at) where invoice_number is null;
alter table public.sandbox_payments alter column invoice_number set not null,
  alter column invoice_product_code set not null, alter column invoice_subproduct_code set not null,
  alter column merchant_ref set not null,
  add constraint payment_invoice_number_unique unique(invoice_number),
  add constraint payment_merchant_ref_unique unique(merchant_ref),
  add constraint payment_invoice_number_format check(invoice_number ~ '^ARNS-[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16}$');
alter table public.live_transactions alter column invoice_number set not null,
  add constraint transaction_invoice_number_unique unique(invoice_number);

create function public.assign_payment_invoice() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if row(old.invoice_number,old.invoice_product_code,old.invoice_subproduct_code,old.merchant_ref)
       is distinct from row(new.invoice_number,new.invoice_product_code,new.invoice_subproduct_code,new.merchant_ref) then
      raise exception 'Immutable invoice number' using errcode='23514';
    end if;
  else
    new.invoice_product_code := public.invoice_code_part(coalesce(new.invoice_product_code,split_part(new.product_name,' - ',1)));
    new.invoice_subproduct_code := public.invoice_code_part(coalesce(new.invoice_subproduct_code,new.provider_code));
    new.invoice_number := public.make_invoice_number(new.invoice_subproduct_code,new.invoice_product_code,coalesce(new.created_at,now()));
    new.merchant_ref := new.invoice_number;
  end if;
  return new;
end; $$;
create trigger assign_payment_invoice before insert or update on public.sandbox_payments for each row execute function public.assign_payment_invoice();

create or replace function public.project_sandbox_order() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.live_transactions(id,invoice_number,user_id,request_hash,category,provider_code,product_name,provider_cost,
    target,target_zone,amount,payment_method,payment_reference,payment_status,fulfillment_status,
    payment_mode,review_required,fulfillment_mode,service_quantity,customer_name,customer_email,customer_phone)
  values(new.id,new.invoice_number,new.owner_user_id,decode(new.request_hash,'hex'),new.source,
    coalesce(new.provider_service_code,new.provider_code),new.product_name,new.provider_cost,new.target,new.target_zone,
    new.amount,new.method,new.reference,new.status,
    case when new.review_required and new.status='paid' then 'manual_review' when new.status='paid' then 'ready' else 'not_ready' end,
    new.payment_mode,new.review_required,new.fulfillment_mode,new.service_quantity,new.customer_name,new.customer_email,new.customer_phone)
  on conflict(id) do update set payment_reference=excluded.payment_reference,
    payment_status=excluded.payment_status,review_required=excluded.review_required,
    fulfillment_status=case when excluded.payment_status='refunded' then 'manual_review'
      when excluded.review_required and excluded.payment_status='paid' then 'manual_review'
      when excluded.payment_status='paid' and public.live_transactions.fulfillment_status='not_ready' then 'ready'
      else public.live_transactions.fulfillment_status end,updated_at=now()
  where public.live_transactions.payment_mode=excluded.payment_mode and public.live_transactions.invoice_number=excluded.invoice_number;
  if not found then raise exception 'Order invoice or mode collision'; end if;
  return new;
end; $$;

create or replace function public.reserve_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.sandbox_payments; v_owner text; v_mode text;
begin
  v := jsonb_populate_record(null::public.sandbox_payments,p_payment);
  v_mode := p_payment->>'payment_mode'; v_owner := coalesce(v.owner_user_id::text,v.guest_session_hash);
  if v_mode is null or v_mode not in ('sandbox','live') or v_owner is null or v.checkout_hash is null
    or v.request_hash is null or v.access_hash is null or (v.owner_user_id is not null and v.guest_session_hash is not null) then
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
    fulfillment_mode,provider_service_code,service_quantity,customer_name,customer_email,customer_phone,invoice_product_code,invoice_subproduct_code)
  values((p_payment->>'id')::uuid,p_payment->>'access_hash',p_payment->>'request_hash',p_payment->>'source',
    p_payment->>'product_name',p_payment->>'provider_code',p_payment->>'target',nullif(p_payment->>'target_zone',''),
    (p_payment->>'amount')::bigint,p_payment->>'method',(p_payment->>'owner_user_id')::uuid,
    p_payment->>'guest_session_hash',p_payment->>'checkout_hash',v_mode,(p_payment->>'provider_cost')::bigint,
    p_payment->>'fulfillment_mode',p_payment->>'provider_service_code',coalesce((p_payment->>'service_quantity')::integer,1),
    p_payment->>'customer_name',p_payment->>'customer_email',p_payment->>'customer_phone',p_payment->>'invoice_product_code',p_payment->>'invoice_subproduct_code')
  returning * into v;
  return jsonb_build_object('payment',to_jsonb(v),'claimed',true);
end; $$;

create function public.guard_transaction_invoice() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.invoice_number := coalesce(new.invoice_number,public.make_invoice_number(new.provider_code,new.product_name,coalesce(new.created_at,now())));
  elsif new.invoice_number is distinct from old.invoice_number then raise exception 'Immutable invoice number' using errcode='23514'; end if;
  return new;
end; $$;
create trigger guard_transaction_invoice before insert or update on public.live_transactions for each row execute function public.guard_transaction_invoice();
revoke all on function public.invoice_code_part(text),public.make_invoice_number(text,text,timestamptz),public.assign_payment_invoice(),public.guard_transaction_invoice() from public,anon,authenticated;
grant execute on function public.invoice_code_part(text),public.make_invoice_number(text,text,timestamptz),public.assign_payment_invoice(),public.guard_transaction_invoice() to service_role;
notify pgrst, 'reload schema';
commit;
