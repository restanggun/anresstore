begin;

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  code text unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{7,63}$'),
  kind text not null check (kind in ('percent','fixed','gift')),
  value integer not null check (value between 1 and 100000000),
  discount_cap integer check (discount_cap between 1 and 100000000),
  minimum_amount integer not null default 0 check (minimum_amount between 0 and 100000000),
  category text check (category in ('game','prepaid','apps','social','tasks')),
  product_slug text check (char_length(product_slug) <= 100 and product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  variant_code text check (variant_code ~ '^[A-Za-z0-9._-]{1,100}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (isfinite(ends_at) and isfinite(starts_at) and ends_at > starts_at),
  total_limit integer not null check (total_limit between 1 and 1000000),
  account_limit integer check (account_limit between 1 and total_limit),
  allow_promotion boolean not null default false,
  active boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_slug is null or category is not null),
  check (variant_code is null or product_slug is not null),
  check (kind <> 'percent' or value between 1 and 99),
  check (kind <> 'gift' or (value = 1 and discount_cap is not null and
    account_limit is not null and category is not null and category in ('game','prepaid','apps') and variant_code is not null))
);
create table public.voucher_accounts (
  voucher_id uuid not null references public.vouchers(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (voucher_id,user_id)
);
create index voucher_accounts_by_user on public.voucher_accounts(user_id) where active;

create table public.voucher_redemptions (
  id bigint generated always as identity primary key,
  voucher_id uuid not null references public.vouchers(id),
  user_id uuid,
  payment_id uuid unique references public.payments(id),
  premium_id uuid unique references public.premium_orders(id),
  base_amount integer not null check (base_amount between 1 and 100000000),
  discount integer not null check (discount between 1 and base_amount),
  voucher_name text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(payment_id,premium_id)=1)
);
create index voucher_redemptions_usage on public.voucher_redemptions(voucher_id,user_id);

alter table public.vouchers enable row level security;
alter table public.voucher_accounts enable row level security;
alter table public.voucher_redemptions enable row level security;
revoke all on public.vouchers,public.voucher_accounts,public.voucher_redemptions from public,anon,authenticated;
grant select,insert,update on public.vouchers,public.voucher_accounts to service_role;
grant select,insert on public.voucher_redemptions to service_role;
grant usage on sequence public.voucher_redemptions_id_seq to service_role;

-- Zero-value orders can only use the internal voucher method, never a payment gateway.
alter table public.payments add column voucher_applied boolean not null default false,
  drop constraint sandbox_payments_amount_check,
  add constraint payments_voucher_amount check ((method='VOUCHER' and amount=0) or (method<>'VOUCHER' and amount between 1 and 100000000));
alter table public.live_transactions drop constraint live_transactions_amount_check,
  add constraint transactions_voucher_amount check ((payment_method='VOUCHER' and amount=0) or (payment_method<>'VOUCHER' and amount between 1 and 100000000));
alter table public.premium_orders drop constraint premium_orders_amount_check,
  add column voucher_gift boolean not null default false,
  add column voucher_applied boolean not null default false,
  add constraint premium_voucher_amount check ((voucher_gift and amount=0 and status in ('paid','delivered','closed')) or
    (not voucher_gift and amount between 1 and 100000000));

create view public.voucher_usage with (security_invoker=true) as
select r.*,
  case when p.status in ('failed','expired') or a.status='cancelled' then 'released'
    when p.status in ('paid','refunded') or a.status in ('paid','delivered','closed') then 'used'
    else 'reserved' end as state
from public.voucher_redemptions r
left join public.payments p on p.id=r.payment_id
left join public.premium_orders a on a.id=r.premium_id;
revoke all on public.voucher_usage from public,anon,authenticated;
grant select on public.voucher_usage to service_role;

create function public.guard_voucher_order() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (
    select 1 from public.voucher_redemptions r
    where r.base_amount-r.discount=new.amount and (new.amount>0 or r.user_id is not null)
      and ((TG_TABLE_NAME='payments' and r.payment_id=new.id) or
           (TG_TABLE_NAME='premium_orders' and r.premium_id=new.id))
  ) then raise exception 'Voucher order requires a matching redemption' using errcode='23514'; end if;
  return null;
end; $$;
create constraint trigger verify_payment_voucher
after insert or update on public.payments deferrable initially deferred for each row
when (new.amount=0 or new.voucher_applied) execute function public.guard_voucher_order();
create constraint trigger verify_premium_voucher
after insert or update on public.premium_orders deferrable initially deferred for each row
when (new.amount=0 or new.voucher_applied) execute function public.guard_voucher_order();
revoke all on function public.guard_voucher_order() from public,anon,authenticated;
grant execute on function public.guard_voucher_order() to service_role;

create function public.voucher_offer(p_voucher jsonb,p_context jsonb,p_lock boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.vouchers; actor uuid := (p_context->>'user_id')::uuid;
  base integer := (p_context->>'base_amount')::integer; used_count bigint; actor_count bigint;
  discount integer; failure constant text := 'Voucher tidak tersedia untuk pesanan ini';
begin
  if p_voucher->>'code' is not null then
    select * into v from public.vouchers where code=p_voucher->>'code';
  else
    select * into v from public.vouchers where id=(p_voucher->>'id')::uuid;
  end if;
  if v.id is null then raise exception '%',failure using errcode='PT409'; end if;

  -- A quote does not hold stock. All reservations of this campaign use the
  -- same row lock, so concurrent checkouts cannot overspend the quota.
  if p_lock then
    select * into v from public.vouchers where id=v.id for update;
  end if;
  if v.id is null or (p_voucher->>'code' is not null and v.code is distinct from p_voucher->>'code')
    or p_context->>'mode' is distinct from 'live'
    or not v.active or clock_timestamp()<v.starts_at or clock_timestamp()>=v.ends_at
    or base is null or base not between greatest(1,v.minimum_amount) and 100000000
    or (v.category is not null and v.category is distinct from p_context->>'source')
    or (v.product_slug is not null and v.product_slug is distinct from p_context->>'product_slug')
    or (v.variant_code is not null and v.variant_code is distinct from p_context->>'code')
    or (not v.allow_promotion and coalesce((p_context->>'promoted')::boolean,false))
    or (v.account_limit is not null and actor is null)
    or (p_voucher->>'id' is not null and not exists (
      select 1 from public.voucher_accounts a where a.voucher_id=v.id and a.user_id=actor and a.active
    )) then raise exception '%',failure using errcode='PT409'; end if;

  select count(*), count(*) filter(where user_id=actor) into used_count,actor_count
  from public.voucher_usage where voucher_id=v.id and state<>'released';
  if used_count>=v.total_limit or actor_count>=v.account_limit then
    raise exception '%',failure using errcode='PT409';
  end if;

  if v.kind='gift' then
    if base>v.discount_cap then
      raise exception '%',failure using errcode='PT409';
    end if;
    discount := base;
  elsif v.kind='fixed' then
    discount := least(v.value,base-1);
  else
    discount := least((base::bigint*v.value/100)::integer,coalesce(v.discount_cap,base),base-1);
  end if;
  if discount<1 then raise exception '%',failure using errcode='PT409'; end if;
  return jsonb_build_object('id',v.id,'name',v.name,'kind',v.kind,'baseAmount',base,'discount',discount,
    'amount',base-discount,'endsAt',v.ends_at);
end; $$;

create function public.voucher_set_account(p_voucher uuid,p_email text,p_active boolean,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
  perform 1 from public.vouchers where id=p_voucher for update;
  if not found then raise exception 'Voucher tidak ditemukan' using errcode='PT409'; end if;
  select id into account_id from auth.users where lower(email)=p_email and email_confirmed_at is not null;
  if account_id is null then raise exception 'Akun terverifikasi tidak ditemukan' using errcode='PT409'; end if;
  insert into public.voucher_accounts(voucher_id,user_id,active) values(p_voucher,account_id,p_active)
    on conflict(voucher_id,user_id) do update set active=excluded.active,assigned_at=now();
  insert into public.admin_audit_log(actor_id,action,target)
    values(p_actor,case when p_active then 'voucher.assign' else 'voucher.revoke' end,p_voucher::text||':'||account_id::text);
  return true;
end; $$;

create function public.voucher_admin_accounts(p_voucher uuid,p_offset integer)
returns table(email text,active boolean,assigned_at timestamptz)
language sql stable security definer set search_path='' as $$
  select u.email::text,a.active,a.assigned_at
  from public.voucher_accounts a join auth.users u on u.id=a.user_id
  where a.voucher_id=p_voucher order by a.assigned_at desc,a.user_id limit 51 offset greatest(0,p_offset);
$$;

create function public.voucher_admin_usage(p_voucher uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('reserved',count(*) filter(where state='reserved'),
    'used',count(*) filter(where state='used'),'released',count(*) filter(where state='released'))
  from public.voucher_usage where voucher_id=p_voucher;
$$;

create function public.voucher_admin_redemptions(p_voucher uuid,p_offset integer)
returns table(id bigint,invoice_number text,state text,discount integer,created_at timestamptz,premium_id uuid,can_release boolean)
language sql stable security invoker set search_path='' as $$
  select r.id,coalesce(p.invoice_number,a.invoice_number),r.state,r.discount,r.created_at,r.premium_id,
    coalesce(a.status='awaiting_qr' or (a.status='awaiting_payment' and a.qr_expires_at<=now() and a.proof_image is null),false)
  from public.voucher_usage r
  left join public.payments p on p.id=r.payment_id
  left join public.premium_orders a on a.id=r.premium_id
  where r.voucher_id=p_voucher order by r.id desc limit 51 offset greatest(0,p_offset);
$$;

create function public.voucher_release_premium(p_voucher uuid,p_order uuid,p_actor uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  -- The administrator confirms absence of a receipt. PostgreSQL rechecks status
  -- at the write, so uploaded proof or issued QR cannot race a cancellation.
  update public.premium_orders a set status='cancelled',updated_at=now()
  where a.id=p_order
    and exists(select 1 from public.voucher_redemptions r where r.premium_id=p_order and r.voucher_id=p_voucher)
    and (a.status='awaiting_qr' or (a.status='awaiting_payment' and a.qr_expires_at<=clock_timestamp() and a.proof_image is null));
  if not found then raise exception 'Premium order cannot be released' using errcode='PT409'; end if;
  insert into public.admin_audit_log(actor_id,action,target) values(p_actor,'voucher.release_premium',p_order::text);
  return true;
end; $$;

create function public.account_vouchers(p_user uuid)
returns table(id uuid,name text,kind text,ends_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select v.id,v.name,v.kind,v.ends_at
    from public.vouchers v join public.voucher_accounts a on v.id=a.voucher_id
    cross join lateral (
      select count(*) total,count(*) filter(where r.user_id=p_user) own
      from public.voucher_usage r where r.voucher_id=v.id and r.state<>'released'
    ) usage
    where a.user_id=p_user and a.active and v.active and v.starts_at<=now() and v.ends_at>now()
      and usage.total<v.total_limit and (v.account_limit is null or usage.own<v.account_limit)
    order by v.ends_at,v.id limit 100;
$$;

create or replace function public.reserve_task_payment(p_payment jsonb,p_task jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; product_id uuid; quoted bigint; existing public.task_order_specs;
begin
  if p_payment->>'source'<>'tasks' or p_payment->>'fulfillment_mode'<>'manual' or p_payment->>'payment_mode' not in ('live','sandbox')
    or p_payment->>'provider_code' !~ '^managed\.[0-9a-f-]{36}$' then
    raise exception 'Invalid task payment' using errcode='PT409';
  end if;
  product_id := substring(p_payment->>'provider_code' from 9)::uuid;
  quoted := public.quote_task_order(product_id,(p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer);
  if quoted is distinct from coalesce(p_payment->>'voucher_base_amount',p_payment->>'amount')::bigint then
    raise exception 'Task price changed' using errcode='PT409';
  end if;
  result := public.reserve_payment(p_payment);
  insert into public.task_order_specs(payment_id,product_id,instructions,reference_url,pages,deadline_days,purchased_revisions,quoted_amount,pricing_unit)
  values((result->'payment'->>'id')::uuid,product_id,p_task->>'instructions',nullif(p_task->>'reference_url',''),
    (p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer,quoted,coalesce(p_task->>'pricing_unit','page'))
  on conflict(payment_id) do nothing;
  select * into existing from public.task_order_specs where payment_id=(result->'payment'->>'id')::uuid;
  if existing.product_id<>product_id or existing.instructions<>p_task->>'instructions'
    or existing.reference_url is distinct from nullif(p_task->>'reference_url','')
    or existing.pages<>(p_task->>'pages')::integer or existing.deadline_days<>(p_task->>'deadline_days')::integer
    or existing.purchased_revisions<>(p_task->>'revisions')::integer or existing.quoted_amount<>quoted or existing.pricing_unit is distinct from coalesce(p_task->>'pricing_unit','page') then
    raise exception 'Task order conflict' using errcode='PT409';
  end if;
  return result;
end; $$;

create function public.reserve_voucher_payment(p_voucher jsonb,p_payment jsonb,p_task jsonb,p_base_amount integer,p_promoted boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare offer jsonb; reserved jsonb; saved public.payments; redemption public.voucher_redemptions; campaign uuid;
begin
  -- Idempotent retries must survive expiry, revocation and exhausted inventory.
  perform pg_advisory_xact_lock(hashtextextended(p_payment->>'id',42));
  select * into saved from public.payments where id=(p_payment->>'id')::uuid;
  if saved.id is not null then
    if saved.request_hash is distinct from p_payment->>'request_hash'
      or saved.owner_user_id is distinct from (p_payment->>'owner_user_id')::uuid
      or saved.guest_session_hash is distinct from p_payment->>'guest_session_hash' then
      raise exception 'Payment intent conflict' using errcode='PT409';
    end if;
    return jsonb_build_object('payment',to_jsonb(saved),'claimed',false);
  end if;
  offer := public.voucher_offer(p_voucher,jsonb_build_object('user_id',p_payment->>'owner_user_id',
    'source',p_payment->>'source','code',p_payment->>'provider_code','product_slug',p_payment->>'invoice_product_code',
    'base_amount',p_base_amount,'promoted',p_promoted,'mode',p_payment->>'payment_mode'),true);
  campaign := (offer->>'id')::uuid;
  if offer->>'amount' is distinct from p_payment->>'amount' or
    ((offer->>'kind'='gift') is distinct from (p_payment->>'method'='VOUCHER')) then
    raise exception 'Voucher total changed' using errcode='PT409';
  end if;
  if p_task is null or p_task='null'::jsonb then
    reserved := public.reserve_payment(p_payment);
  else
    reserved := public.reserve_task_payment(p_payment||jsonb_build_object('voucher_base_amount',p_base_amount),p_task);
  end if;
  if not (reserved->>'claimed')::boolean then
    select * into redemption from public.voucher_redemptions where payment_id=(reserved->'payment'->>'id')::uuid;
    if redemption.voucher_id is distinct from campaign or
      reserved->'payment'->>'amount' is distinct from offer->>'amount' then
      raise exception 'Existing checkout uses different voucher or amount' using errcode='PT409';
    end if;
    return reserved;
  end if;
  insert into public.voucher_redemptions(voucher_id,user_id,payment_id,base_amount,discount,voucher_name)
    values(campaign,(p_payment->>'owner_user_id')::uuid,(p_payment->>'id')::uuid,p_base_amount,(offer->>'discount')::integer,offer->>'name');
  if offer->>'kind'='gift' then
    update public.payments set status='paid',voucher_applied=true,revision=revision+1,updated_at=now()
      where id=(p_payment->>'id')::uuid returning * into saved;
    return jsonb_build_object('payment',to_jsonb(saved),'claimed',true);
  end if;
  update public.payments set voucher_applied=true where id=(p_payment->>'id')::uuid returning * into saved;
  return jsonb_build_object('payment',to_jsonb(saved),'claimed',true);
end; $$;

create function public.reserve_premium_voucher(p_voucher jsonb,p_id uuid,p_user uuid,p_guest_hash text,
  p_email text,p_phone text,p_product uuid,p_base_amount integer,p_expected_amount integer,
  p_rule_updated_at timestamptz,p_catalog_revision bigint,p_promoted boolean)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare item public.managed_products; rule public.premium_product_rules; saved public.premium_orders;
  offer jsonb; gift boolean; catalog_version bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,41));
  select * into saved from public.premium_orders where id=p_id;
  if saved.id is not null then
    if saved.user_id is distinct from p_user or saved.guest_session_hash is distinct from p_guest_hash or
      saved.product_id<>p_product or saved.amount<>p_expected_amount or saved.customer_email is distinct from p_email or
      saved.customer_phone is distinct from p_phone or not exists(select 1 from public.voucher_redemptions where premium_id=p_id) then
      raise exception 'Premium order conflict' using errcode='PT409';
    end if;
    return next saved; return;
  end if;
  select * into item from public.managed_products where id=p_product and category='apps' and provider='manual' and active and deleted_at is null for share;
  select * into rule from public.premium_product_rules where product_id=p_product for share;
  select version into catalog_version from public.catalog_versions where category='apps' for share;
  if item.id is null or rule.product_id is null or catalog_version is distinct from p_catalog_revision or
    rule.updated_at is distinct from p_rule_updated_at then
    raise exception 'Premium product unavailable or terms changed' using errcode='PT409';
  end if;
  offer := public.voucher_offer(p_voucher,jsonb_build_object('user_id',p_user,'source','apps',
    'product_slug',item.product_slug,'code','managed.'||p_product::text,'base_amount',p_base_amount,'mode','live','promoted',p_promoted),true);
  if (offer->>'amount')::integer is distinct from p_expected_amount then
    raise exception 'Voucher total changed' using errcode='PT409';
  end if;
  gift := offer->>'kind'='gift';
  insert into public.premium_orders(id,user_id,guest_session_hash,customer_email,customer_phone,product_id,product_name,
    access_type,duration_days,guarantee_days,guarantee_terms,amount,status,paid_at,voucher_gift,voucher_applied)
  values(p_id,p_user,p_guest_hash,p_email,p_phone,p_product,item.product||' - '||item.name,
    rule.access_type,rule.duration_days,rule.guarantee_days,rule.guarantee_terms,p_expected_amount,
    case when gift then 'paid' else 'awaiting_qr' end,case when gift then now() end,gift,true)
  returning * into saved;
  insert into public.voucher_redemptions(voucher_id,user_id,premium_id,base_amount,discount,voucher_name)
    values((offer->>'id')::uuid,p_user,p_id,p_base_amount,(offer->>'discount')::integer,offer->>'name');
  return next saved;
end; $$;

revoke all on function public.voucher_offer(jsonb,jsonb,boolean),public.voucher_set_account(uuid,text,boolean,uuid),
  public.voucher_admin_accounts(uuid,integer),public.voucher_admin_usage(uuid),public.account_vouchers(uuid),
  public.voucher_admin_redemptions(uuid,integer),public.voucher_release_premium(uuid,uuid,uuid),
  public.reserve_voucher_payment(jsonb,jsonb,jsonb,integer,boolean),
  public.reserve_premium_voucher(jsonb,uuid,uuid,text,text,text,uuid,integer,integer,timestamptz,bigint,boolean)
  from public,anon,authenticated;
grant execute on function public.voucher_offer(jsonb,jsonb,boolean),public.voucher_set_account(uuid,text,boolean,uuid),
  public.voucher_admin_accounts(uuid,integer),public.voucher_admin_usage(uuid),public.account_vouchers(uuid),
  public.voucher_admin_redemptions(uuid,integer),public.voucher_release_premium(uuid,uuid,uuid),
  public.reserve_voucher_payment(jsonb,jsonb,jsonb,integer,boolean),
  public.reserve_premium_voucher(jsonb,uuid,uuid,text,text,text,uuid,integer,integer,timestamptz,bigint,boolean)
  to service_role;

notify pgrst, 'reload schema';
commit;
