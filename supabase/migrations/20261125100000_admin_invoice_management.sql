begin;

alter table public.invoices add column archived_at timestamptz;
alter table public.payments add column archived_at timestamptz;
alter table public.premium_orders add column archived_at timestamptz,
  add column admin_customer_name text check (char_length(admin_customer_name) <= 100);

create table public.invoice_admin_evidence (
  invoice_id uuid primary key references public.invoices(id),
  proof_image text not null check (char_length(proof_image) <= 13981080),
  proof_note text check (char_length(proof_note) <= 500)
);
create table public.invoice_review_links (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  invoice_id uuid not null references public.invoices(id),
  expires_at timestamptz not null
);
create index invoice_review_links_invoice on public.invoice_review_links(invoice_id);
alter table public.invoice_admin_evidence enable row level security;
alter table public.invoice_review_links enable row level security;
revoke all on public.invoice_admin_evidence, public.invoice_review_links from public, anon, authenticated;
grant select on public.invoice_admin_evidence, public.invoice_review_links to service_role;

-- Allow the admin RPC to amend the permitted fields while retaining all payment
-- identity, gateway-reference, invoice number and revision guards.
create or replace function public.guard_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare admin_write boolean := current_user <> 'service_role' and current_setting('anres.invoice_admin', true) is not distinct from 'on';
begin
  if row(old.id,old.owner_user_id,old.guest_session_hash,old.checkout_hash,old.access_hash,
         old.request_hash,old.method,old.source,old.provider_code,old.created_at)
     is distinct from
     row(new.id,new.owner_user_id,new.guest_session_hash,new.checkout_hash,new.access_hash,
         new.request_hash,new.method,new.source,new.provider_code,new.created_at)
     or (not admin_write and row(old.amount,old.product_name,old.target) is distinct from row(new.amount,new.product_name,new.target)) then
    raise exception 'Immutable payment data' using errcode='23514';
  end if;
  if old.reference is not null and old.reference is distinct from new.reference then
    raise exception 'Immutable payment reference' using errcode='23514';
  end if;
  if old.status is distinct from new.status and not (
    (old.status in ('creating','unknown','pending') and new.status in ('unknown','pending','paid','failed','expired')) or
    (old.status='paid' and new.status='refunded') or
    (admin_write and old.method='MANUAL_QRIS')
  ) then raise exception 'Invalid payment transition' using errcode='23514'; end if;
  if row(old.status,old.reference,old.details,old.review_required) is distinct from row(new.status,new.reference,new.details,new.review_required)
     and new.revision <> old.revision+1 then
    raise exception 'Payment revision required' using errcode='23514';
  end if;
  return new;
end; $$;

create or replace function public.guard_order_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
declare admin_write boolean := current_user <> 'service_role' and current_setting('anres.invoice_admin', true) is not distinct from 'on';
begin
  if (old.provider_cost is not null and old.provider_cost is distinct from new.provider_cost)
    or (not admin_write and old.target_zone is not null and old.target_zone is distinct from new.target_zone)
    or (not admin_write and old.customer_email is not null and row(old.customer_name,old.customer_email,old.customer_phone)
        is distinct from row(new.customer_name,new.customer_email,new.customer_phone))
    or (old.provider_service_code is not null and row(old.provider_service_code,old.fulfillment_mode,old.service_quantity)
        is distinct from row(new.provider_service_code,new.fulfillment_mode,new.service_quantity))
  then raise exception 'Immutable order metadata'; end if;
  return new;
end; $$;

create or replace function public.cancel_expired_premium_orders()
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update public.premium_orders set status='cancelled', updated_at=clock_timestamp()
  where payment_mode='live' and archived_at is null and proof_image is null
    and status in ('awaiting_qr','awaiting_payment')
    and coalesce(qr_expires_at, created_at + interval '1 hour') <= clock_timestamp();
  get diagnostics affected = row_count;
  return affected;
end; $$;

create function public.admin_manage_invoice(p_actor uuid, p_id uuid, p_action text, p_data jsonb)
returns table (invoice_id uuid, invoice_number text)
language plpgsql security definer set search_path='' as $$
declare
  item public.invoices;
  pay public.payments;
  premium public.premium_orders;
  delivery public.live_transactions;
  task_status text;
  owner_id uuid;
  redemption public.voucher_redemptions;
  coupon public.vouchers;
  used_count bigint;
  account_count bigint;
  next_status text := p_data->>'status';
  now_at timestamptz;
begin
  if p_action='create' then
    select a.id into owner_id from auth.users a join public.users u on u.id=a.id
    where a.email_confirmed_at is not null and lower(a.email)=p_data->>'email' limit 1;
    insert into public.payments (id,access_hash,request_hash,guest_session_hash,owner_user_id,
      source,product_slug,product_name,provider_code,target,target_zone,amount,method,status,
      fulfillment_mode,customer_name,customer_email,customer_phone)
    values (p_id,p_data->>'identityHash',p_data->>'identityHash',
      case when owner_id is null then p_data->>'identityHash' end,owner_id,
      p_data->>'category',p_data->>'productSlug',p_data->>'productName','manual-admin',
      p_data->>'target',p_data->>'targetZone',(p_data->>'amount')::bigint,'MANUAL_QRIS','pending',
      'manual',p_data->>'name',p_data->>'email',p_data->>'phone')
    on conflict (id) do nothing;
    select * into item from public.invoices where id=p_id and order_kind='payment' and archived_at is null;
    if not found or not exists (select 1 from public.payments where id=p_id and access_hash=p_data->>'identityHash')
      then raise exception 'Create conflict' using errcode='PT409'; end if;
  else
    -- Lock the source first, following the payment and premium projection order.
    select * into pay from public.payments where id=p_id and payment_mode='live' and archived_at is null for update;
    if found then
      select * into delivery from public.live_transactions where id=p_id for update;
    else
      select * into premium from public.premium_orders where id=p_id and payment_mode='live' and archived_at is null for update;
    end if;
    select * into item from public.invoices where id=p_id and payment_mode='live' and archived_at is null for update;
    if not found or (pay.id is null and premium.id is null) then
      raise exception 'Invoice unavailable' using errcode='PT409';
    end if;
    if p_action in ('edit','status','restore','archive') and item.updated_at is distinct from (p_data->>'version')::timestamptz then
      raise exception 'Invoice changed' using errcode='PT409';
    end if;
    now_at := clock_timestamp();
    perform set_config('anres.invoice_admin','on',true);
    if p_action='edit' then
      if premium.id is not null then
        if p_data ? 'amount' and (premium.status<>'awaiting_qr' or premium.voucher_applied) then
          raise exception 'Premium price is locked' using errcode='PT409';
        end if;
        update public.premium_orders set product_name=coalesce(p_data->>'productName',product_name),
          amount=coalesce((p_data->>'amount')::bigint,amount), admin_customer_name=p_data->>'name',
          customer_email=p_data->>'email',customer_phone=p_data->>'phone',updated_at=now_at where id=p_id;
      else
        if (p_data ? 'amount' and (pay.method<>'MANUAL_QRIS' or pay.status<>'pending' or
              exists(select 1 from public.invoice_admin_evidence e where e.invoice_id=p_id)))
           or (p_data ? 'target' and (exists (select 1 from public.task_order_specs where payment_id=p_id) or
                 delivery.fulfillment_status not in ('not_ready','ready')))
          then raise exception 'Price or destination is locked' using errcode='PT409'; end if;
        update public.payments set product_name=coalesce(p_data->>'productName',product_name),
          target=coalesce(p_data->>'target',target),target_zone=case when p_data ? 'target' then p_data->>'targetZone' else target_zone end,
          amount=coalesce((p_data->>'amount')::bigint,amount),customer_name=p_data->>'name',
          customer_email=p_data->>'email',customer_phone=p_data->>'phone',updated_at=now_at where id=p_id;
        update public.live_transactions t set product_name=p.product_name,target=p.target,target_zone=p.target_zone,amount=p.amount,
          customer_name=p.customer_name,customer_email=p.customer_email,customer_phone=p.customer_phone,updated_at=now_at
          from public.payments p where t.id=p_id and p.id=t.id;
      end if;
    elsif p_action='proof' then
      if premium.id is not null then
        if premium.status not in ('awaiting_qr','awaiting_payment','proof_submitted') then
          raise exception 'Premium is not awaiting proof' using errcode='PT409'; end if;
        update public.premium_orders set proof_image=p_data->>'image',proof_note=p_data->>'note',
          status='proof_submitted',updated_at=now_at where id=p_id;
      else
        insert into public.invoice_admin_evidence(invoice_id,proof_image,proof_note)
          values(p_id,p_data->>'image',p_data->>'note')
          on conflict on constraint invoice_admin_evidence_pkey do update set proof_image=excluded.proof_image,proof_note=excluded.proof_note;
        update public.invoices set updated_at=now_at where id=p_id;
      end if;
    elsif p_action='restore' then
      if premium.id is not null and premium.status='cancelled' then
        if premium.voucher_applied then
          select r.* into redemption from public.voucher_redemptions r where r.premium_id=p_id;
          select * into coupon from public.vouchers where id=redemption.voucher_id for update;
          select count(*),count(*) filter(where user_id=redemption.user_id) into used_count,account_count
          from public.voucher_usage where voucher_id=coupon.id and state<>'released';
          if coupon.id is null or used_count>=coupon.total_limit or account_count>=coupon.account_limit then
            raise exception 'Voucher quota no longer available' using errcode='PT409';
          end if;
        end if;
        update public.premium_orders set status=case when proof_image is not null then 'proof_submitted'
            when coalesce(p_data->>'newQr',qr_image) is not null then 'awaiting_payment' else 'awaiting_qr' end,
          qr_image=coalesce(p_data->>'newQr',qr_image),qr_expires_at=now_at+interval '1 hour',updated_at=now_at where id=p_id;
      elsif pay.method='MANUAL_QRIS' and pay.status in ('failed','expired') then
        update public.payments set status='pending',revision=revision+1,updated_at=now_at where id=p_id;
        update public.live_transactions set fulfillment_status='not_ready',updated_at=now_at where id=p_id;
      else
        raise exception 'Gateway invoice cannot be reopened' using errcode='PT409';
      end if;
    elsif p_action='status' then
      if premium.id is not null then
        if not ((next_status='paid' and premium.status='proof_submitted' and premium.proof_image is not null)
          or (next_status='delivered' and premium.status='paid')
          or (next_status='closed' and premium.status='delivered')
          or (next_status='cancelled' and premium.status in ('awaiting_qr','awaiting_payment','proof_submitted'))) then
          raise exception 'Invalid premium transition' using errcode='PT409'; end if;
        update public.premium_orders set status=next_status,updated_at=now_at,
          paid_at=case when next_status='paid' then now_at else paid_at end,
          delivered_at=case when next_status='delivered' then now_at else delivered_at end where id=p_id;
      elsif p_data->>'field'='payment' then
        if pay.method<>'MANUAL_QRIS' or not ((pay.status='pending' and next_status='failed') or
          (pay.status='pending' and next_status='paid' and exists(select 1 from public.invoice_admin_evidence e where e.invoice_id=p_id)) or
          (pay.status='paid' and next_status='refunded')) then
          raise exception 'Invalid manual payment transition' using errcode='PT409'; end if;
        update public.payments set status=next_status,revision=revision+1,updated_at=now_at where id=p_id;
      elsif p_data->>'field'='fulfillment' then
        if pay.status<>'paid' or delivery.fulfillment_mode<>'manual' or
          exists(select 1 from public.task_order_specs where payment_id=p_id) or
          next_status not in ('ready','processing','completed','failed') or
          delivery.fulfillment_status in ('completed','failed') then
          raise exception 'Use original fulfillment workflow' using errcode='PT409'; end if;
        update public.live_transactions set fulfillment_status=next_status,provider_note=p_data->>'note',updated_at=now_at where id=p_id;
      else
        raise exception 'Invalid status field' using errcode='PT409';
      end if;
    elsif p_action='archive' then
      if (pay.id is not null and (pay.status in ('creating','pending','unknown') or
          (pay.status='paid' and (coalesce(delivery.fulfillment_status,'not_ready') not in ('completed','failed')
              or exists(select 1 from public.task_order_specs where payment_id=p_id and workflow_status<>'completed')))))
          or (premium.id is not null and premium.status not in ('cancelled','delivered','closed')) then
        raise exception 'Close pending work before archiving' using errcode='PT409';
      end if;
      update public.payments set archived_at=now_at where id=p_id;
      update public.premium_orders set archived_at=now_at where id=p_id;
      update public.invoices set archived_at=now_at,updated_at=now_at where id=p_id;
    elsif p_action='share' then
      select workflow_status into task_status from public.task_order_specs where payment_id=p_id;
      if item.payment_status<>'paid' or item.fulfillment_status<>'completed' or item.amount<=0 or
        item.product_slug is null or item.customer_email is null or
        (task_status is not null and task_status<>'completed') or
        exists(select 1 from public.product_reviews where product_reviews.invoice_id=p_id) then
        raise exception 'Invoice cannot be reviewed' using errcode='PT409';
      end if;
      delete from public.invoice_review_links where expires_at<=now_at and invoice_review_links.invoice_id=p_id;
      insert into public.invoice_review_links(token_hash,invoice_id,expires_at)
        values(p_data->>'tokenHash',p_id,now_at+interval '30 days');
    else
      raise exception 'Unknown invoice action' using errcode='PT409';
    end if;
    perform set_config('anres.invoice_admin','off',true);
  end if;
  insert into public.admin_audit_log(actor_id,action,target) values(p_actor,'invoice.'||p_action,p_id::text);
  return query select item.id,item.invoice_number;
end; $$;
revoke all on function public.admin_manage_invoice(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_manage_invoice(uuid,uuid,text,jsonb) to service_role;

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
where coalesce(p.payment_mode,t.payment_mode)='live' and p.archived_at is null
union all
select o.id::text,o.invoice_number,o.created_at,o.updated_at,'apps',o.product_name,'premium',
  'Aplikasi premium',null,o.amount,'QRIS',null,
  case when o.status in ('paid','delivered','closed') then 'paid'
       when o.status='cancelled' then 'cancelled' else 'pending' end,
  case when o.status in ('delivered','closed') then 'completed'
       when o.status='paid' then 'ready'
       when o.status='proof_submitted' then 'manual_review'
       else o.status end,
  null,null,o.payment_mode,o.status='proof_submitted','manual',1,o.admin_customer_name,o.customer_email,o.customer_phone,
  'premium','premium',coalesce(snapshot.cost_price,premium.cost_price)
from public.premium_orders o
left join public.premium_order_costs snapshot on snapshot.order_id=o.id
left join public.managed_products premium on premium.id=o.product_id
where o.payment_mode='live' and o.archived_at is null
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

-- Lock the invoice while creating a review through an emailed or shared link.
create function public.submit_linked_invoice_review(p_token_hash text,p_rating numeric,p_comment text)
returns table(id uuid) language plpgsql security definer set search_path='' as $$
declare item public.invoices;
begin
  select i.* into item from public.invoices i
  join public.invoice_review_links l on l.invoice_id=i.id
  where l.token_hash=p_token_hash and l.expires_at>clock_timestamp()
  for share of i;
  if not found or item.archived_at is not null or item.payment_mode<>'live'
    or item.payment_status<>'paid' or item.fulfillment_status<>'completed' or item.amount<=0
    or item.product_slug is null or nullif(btrim(item.customer_email),'') is null
    or exists(select 1 from public.task_order_specs where payment_id=item.id and workflow_status<>'completed')
  then raise exception 'Invoice no longer eligible for review' using errcode='PT409'; end if;
  return query insert into public.product_reviews(category,product_slug,rating,comment,reviewer_email,
    reviewer_user_id,invoice_id,purchase_verified,status)
  values(item.category,item.product_slug,p_rating,p_comment,lower(btrim(item.customer_email)),
    coalesce(item.owner_user_id,item.claimed_user_id),item.id,true,'pending')
  returning product_reviews.id;
end; $$;
revoke all on function public.submit_linked_invoice_review(text,numeric,text) from public,anon,authenticated;
grant execute on function public.submit_linked_invoice_review(text,numeric,text) to service_role;

notify pgrst, 'reload schema';
commit;
