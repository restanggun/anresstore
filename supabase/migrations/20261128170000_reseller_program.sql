begin;

create table public.reseller_settings (
  id integer primary key check(id=1),
  registration_open boolean not null default false,
  perak_voucher_id uuid references public.vouchers(id),
  emas_voucher_id uuid references public.vouchers(id),
  check(perak_voucher_id is null or emas_voucher_id is null or perak_voucher_id<>emas_voucher_id)
);
insert into public.reseller_settings(id) values(1);

create table public.resellers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  shop_name text not null check(char_length(btrim(shop_name)) between 2 and 80),
  whatsapp text not null check(whatsapp ~ '^\+?[0-9]{8,15}$'),
  status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.reseller_prices (
  category text not null check(category in ('game','prepaid')),
  code text not null check(char_length(code) between 1 and 100),
  starter integer not null check(starter between 1 and 100000000),
  pro integer not null check(pro between 1 and starter),
  partner integer not null check(partner between 1 and pro),
  primary key(category,code)
);

create table public.reseller_keys (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(user_id),
  secret_hash text not null unique check(secret_hash ~ '^[a-f0-9]{64}$'),
  label text not null check(char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index reseller_keys_owner_idx on public.reseller_keys(reseller_id,created_at desc);

create table public.reseller_orders (
  payment_id uuid primary key references public.payments(id),
  reseller_id uuid not null references public.resellers(user_id),
  channel text not null check(channel in ('dashboard','api')),
  tier text not null check(tier in ('starter','pro','partner')),
  completed_at timestamptz
);
create index reseller_orders_owner_idx on public.reseller_orders(reseller_id,payment_id);

create table public.retail_tier_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check(tier in ('perak','emas')),
  voucher_id uuid not null references public.vouchers(id),
  claimed_at timestamptz not null default now(),
  primary key(user_id,tier)
);

alter table public.reseller_settings enable row level security;
alter table public.resellers enable row level security;
alter table public.reseller_prices enable row level security;
alter table public.reseller_keys enable row level security;
alter table public.reseller_orders enable row level security;
alter table public.retail_tier_claims enable row level security;
revoke all on public.reseller_settings,public.resellers,public.reseller_prices,public.reseller_keys,public.reseller_orders from public,anon,authenticated;
grant select,insert,update on public.reseller_settings,public.resellers,public.reseller_prices,public.reseller_keys,public.reseller_orders to service_role;
grant delete on public.reseller_prices to service_role;
revoke all on public.retail_tier_claims from public,anon,authenticated;
grant select,insert on public.retail_tier_claims to service_role;

create function public.reseller_progress(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with eligible as (
    select i.id,i.amount,coalesce(r.completed_at,i.created_at) as completed_at,r.payment_id is not null as wholesale,
      greatest(0,i.amount-coalesce(f.refund_amount,0)) net
    from public.invoices i
    left join public.reseller_orders r on r.payment_id=i.payment_id
    left join lateral (
      select sum(c.refund_amount) refund_amount from public.support_conversations c
      where c.payment_id=i.payment_id and c.refund_status='completed'
    ) f on true
    where coalesce(i.owner_user_id,i.claimed_user_id)=p_user
      and i.payment_mode='live' and i.payment_status='paid'
      and i.fulfillment_status='completed' and i.source_method<>'VOUCHER'
      and (r.payment_id is null or r.reseller_id=p_user)
  ), totals as (
    select coalesce(sum(net) filter(where not wholesale),0) retail,
      coalesce(sum(net) filter(where wholesale and completed_at>=now()-interval '90 days'),0) volume,
      coalesce(sum(net) filter(where wholesale),0) activation_spend
    from eligible
  )
  select jsonb_build_object('retailSpend',retail,'volume',volume,'activationSpend',activation_spend,'activated',activation_spend>=100000,
    'retailTier',case when retail>=1000000 then 'emas' when retail>=250000 then 'perak' else 'reguler' end,
    'tier',case when activation_spend>=100000 and volume>=10000000 then 'partner'
      when activation_spend>=100000 and volume>=2000000 then 'pro' else 'starter' end)
  from totals
$$;

create function public.claim_retail_tier(p_user uuid,p_tier text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
  progress jsonb;
  template uuid;
  awarded uuid;
begin
  if p_tier not in ('perak','emas') then raise exception 'Tier unavailable' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_tier,0));
  if exists(select 1 from public.retail_tier_claims where user_id=p_user and tier=p_tier) then return true; end if;
  progress := public.reseller_progress(p_user);
  if (progress->>'retailSpend')::bigint <
    (case when p_tier='emas' then 1000000 else 250000 end)
    then raise exception 'Tier unavailable' using errcode='PT409'; end if;
  select case when p_tier='emas' then emas_voucher_id else perak_voucher_id end
    into template from public.reseller_settings where id=1 for share;
  perform 1 from public.vouchers where id=template and code is null and account_limit=1
    and active and now()>=starts_at and now()<ends_at and kind<>'gift' for share;
  if not found then raise exception 'Voucher unavailable' using errcode='PT409'; end if;
  insert into public.vouchers(name,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,
    targets,starts_at,ends_at,total_limit,account_limit,allow_promotion,active)
    select name,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,
      targets,starts_at,ends_at,1,1,allow_promotion,true from public.vouchers where id=template
    returning id into awarded;
  insert into public.retail_tier_claims(user_id,tier,voucher_id) values(p_user,p_tier,awarded);
  insert into public.voucher_accounts(voucher_id,user_id) values(awarded,p_user);
  return true;
end
$$;

create function public.submit_reseller(p_user uuid,p_name text,p_whatsapp text) returns public.resellers
language plpgsql security invoker set search_path='' as $$
declare saved public.resellers;
begin
  perform 1 from public.reseller_settings where id=1 and registration_open for share;
  if not found then raise exception 'Registration closed' using errcode='PT409'; end if;
  insert into public.resellers(user_id,shop_name,whatsapp) values(p_user,p_name,p_whatsapp)
  on conflict(user_id) do update set shop_name=excluded.shop_name,whatsapp=excluded.whatsapp,
    status='pending',revision=public.resellers.revision+1,updated_at=now()
  where public.resellers.status='rejected'
  returning * into saved;
  if not found then
    select * into saved from public.resellers where user_id=p_user;
    if saved.status<>'pending' or saved.shop_name<>p_name or saved.whatsapp<>p_whatsapp
      then raise exception 'Application exists' using errcode='PT409'; end if;
  end if;
  return saved;
end
$$;

create function public.reserve_reseller_payment(p_payment jsonb,p_channel text,p_key_hash text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := (p_payment->>'owner_user_id')::uuid;
  member public.resellers;
  prices public.reseller_prices;
  progress jsonb;
  tier text;
  amount integer;
  result jsonb;
  existing public.reseller_orders;
begin
  select * into member from public.resellers where user_id=actor for update;
  if not found or member.status<>'approved' or p_payment->>'payment_mode'<>'live'
    or p_payment->>'method'='VOUCHER' or p_channel not in ('dashboard','api')
    then raise exception 'Reseller unavailable' using errcode='PT409'; end if;
  progress := public.reseller_progress(actor);
  if p_channel='api' then
    if not (progress->>'activated')::boolean then raise exception 'Reseller inactive' using errcode='PT409'; end if;
    perform 1 from public.reseller_keys where reseller_id=actor and secret_hash=p_key_hash and revoked_at is null for share;
    if not found then raise exception 'Key unavailable' using errcode='PT409'; end if;
  end if;
  select * into existing from public.reseller_orders where payment_id=(p_payment->>'id')::uuid;
  if found then
    if existing.reseller_id<>actor or existing.channel<>p_channel
      then raise exception 'Reseller payment conflict' using errcode='PT409'; end if;
    return public.reserve_payment(p_payment);
  end if;
  tier := progress->>'tier';
  select * into prices from public.reseller_prices where category=p_payment->>'source' and code=p_payment->>'provider_code' for share;
  amount := case tier when 'partner' then prices.partner when 'pro' then prices.pro else prices.starter end;
  if amount is null or amount<>(p_payment->>'amount')::integer
    or amount<=coalesce((p_payment->>'provider_cost')::integer,0)
    then raise exception 'Reseller quote changed' using errcode='PT409'; end if;
  if not (progress->>'activated')::boolean and exists (
    select 1 from public.reseller_orders o join public.invoices i on i.payment_id=o.payment_id
    where o.reseller_id=actor and (i.payment_status in ('creating','pending','unknown')
      or i.payment_status='paid' and i.fulfillment_status not in ('failed','completed'))
  ) then raise exception 'Activation in progress' using errcode='PT409'; end if;
  result := public.reserve_payment(p_payment);
  if (result->'payment'->>'id')::uuid is distinct from (p_payment->>'id')::uuid then
    raise exception 'Reseller payment conflict' using errcode='PT409';
  end if;
  if not coalesce((result->>'claimed')::boolean,false) then
    raise exception 'Payment belongs to another checkout' using errcode='PT409';
  end if;
  insert into public.reseller_orders(payment_id,reseller_id,channel,tier)
    values((p_payment->>'id')::uuid,actor,p_channel,tier);
  return result;
end
$$;

create function public.mark_wholesale_completed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.payment_status='paid' and new.fulfillment_status='completed' and new.payment_mode='live' then
    update public.reseller_orders set completed_at=now() where payment_id=new.payment_id and completed_at is null;
  end if;
  return new;
end
$$;
create trigger mark_wholesale_completed after update of payment_status,fulfillment_status on public.invoices
for each row execute function public.mark_wholesale_completed();

revoke all on function public.reseller_progress(uuid),public.submit_reseller(uuid,text,text),public.reserve_reseller_payment(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.reseller_progress(uuid),public.submit_reseller(uuid,text,text),public.reserve_reseller_payment(jsonb,text,text) to service_role;
revoke all on function public.claim_retail_tier(uuid,text),public.mark_wholesale_completed() from public,anon,authenticated;
grant execute on function public.claim_retail_tier(uuid,text),public.mark_wholesale_completed() to service_role;
notify pgrst, 'reload schema';
commit;
