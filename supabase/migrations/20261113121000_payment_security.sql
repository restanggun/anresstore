-- Run this whole file in the Supabase SQL Editor after sandbox_payments exists.
-- Additive hardening: existing sandbox invoices remain readable by their legacy capability.
begin;
alter table public.sandbox_payments
  add column owner_user_id uuid references auth.users(id) on delete restrict,
  add column guest_session_hash text check (guest_session_hash ~ '^[a-f0-9]{64}$'),
  add column checkout_hash text check (checkout_hash ~ '^[a-f0-9]{64}$'),
  add column revision bigint not null default 0 check (revision >= 0),
  add column provider_checked_at timestamptz,
  add column provider_check_until timestamptz,
  add column review_required boolean not null default false,
  add constraint sandbox_payment_one_owner check (owner_user_id is null or guest_session_hash is null);
create index sandbox_payment_owner_idx on public.sandbox_payments(owner_user_id, created_at desc);
create index sandbox_payment_guest_idx on public.sandbox_payments(guest_session_hash, created_at desc);
create index sandbox_payment_reconcile_idx on public.sandbox_payments(status, provider_check_until);

create table public.payment_rate_buckets (
  bucket_key text not null check (length(bucket_key) between 1 and 150),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key(bucket_key, window_start)
);
create index payment_rate_expiry_idx on public.payment_rate_buckets(expires_at);
alter table public.payment_rate_buckets enable row level security;
revoke all on public.payment_rate_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.payment_rate_buckets to service_role;

create table public.payment_audit_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.sandbox_payments(id) on delete restrict,
  previous_status text,
  next_status text not null,
  revision bigint not null,
  review_required boolean not null,
  created_at timestamptz not null default now()
);
alter table public.payment_audit_events enable row level security;
revoke all on public.payment_audit_events from public, anon, authenticated;
grant select, insert on public.payment_audit_events to service_role;
grant usage, select on sequence public.payment_audit_events_id_seq to service_role;

create function public.audit_sandbox_payment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.payment_audit_events(payment_id, next_status, revision, review_required)
      values(new.id, new.status, new.revision, new.review_required);
  elsif old.status is distinct from new.status or old.review_required is distinct from new.review_required then
    insert into public.payment_audit_events(payment_id, previous_status, next_status, revision, review_required)
      values(new.id, old.status, new.status, new.revision, new.review_required);
  end if;
  return new;
end;
$$;
create trigger audit_sandbox_payment after insert or update on public.sandbox_payments
  for each row execute function public.audit_sandbox_payment();

-- Enforce immutable order/ownership data and monotonic state even if an API worker has a bug.
create function public.guard_sandbox_payment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(old.id,old.owner_user_id,old.guest_session_hash,old.checkout_hash,old.access_hash,
         old.request_hash,old.amount,old.method,old.source,old.provider_code,old.product_name,old.target,old.created_at)
     is distinct from
     row(new.id,new.owner_user_id,new.guest_session_hash,new.checkout_hash,new.access_hash,
         new.request_hash,new.amount,new.method,new.source,new.provider_code,new.product_name,new.target,new.created_at) then
    raise exception 'Immutable payment data' using errcode = '23514';
  end if;
  if old.reference is not null and old.reference is distinct from new.reference then
    raise exception 'Immutable payment reference' using errcode = '23514';
  end if;
  if old.status is distinct from new.status and not (
    (old.status in ('creating','unknown','pending') and new.status in ('unknown','pending','paid','failed','expired')) or
    (old.status = 'paid' and new.status = 'refunded')
  ) then raise exception 'Invalid payment transition' using errcode = '23514'; end if;
  if row(old.status,old.reference,old.details,old.review_required) is distinct from row(new.status,new.reference,new.details,new.review_required)
     and new.revision <> old.revision + 1 then
    raise exception 'Payment revision required' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_sandbox_payment before update on public.sandbox_payments
  for each row execute function public.guard_sandbox_payment();

-- Atomic shared rate limits: survive restarts and work across API replicas.
create function public.consume_payment_rate(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_start timestamptz; v_count integer;
begin
  if p_limit not between 1 and 10000 or p_seconds not between 1 and 86400 then
    raise exception 'Invalid rate configuration';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.payment_rate_buckets(bucket_key,window_start,expires_at,attempts)
    values(p_key,v_start,v_start + make_interval(secs => p_seconds * 2),1)
    on conflict(bucket_key,window_start) do update
      set attempts = least(public.payment_rate_buckets.attempts + 1, p_limit + 1)
    returning attempts into v_count;
  delete from public.payment_rate_buckets where (bucket_key,window_start) in
    (select bucket_key,window_start from public.payment_rate_buckets where expires_at < now() limit 100);
  return v_count <= p_limit;
end;
$$;

-- Only the winner reserves a new payment. Never retry sending after an ambiguous result.
-- The owner lock also collapses equivalent requests using different IDs across tabs/workers.
create function public.reserve_sandbox_payment(p_payment jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.sandbox_payments; v_owner text;
begin
  v := jsonb_populate_record(null::public.sandbox_payments, p_payment);
  v_owner := coalesce(v.owner_user_id::text, v.guest_session_hash);
  if v_owner is null or v.checkout_hash is null or v.request_hash is null or v.access_hash is null
     or (v.owner_user_id is not null and v.guest_session_hash is not null) then
    raise exception 'Invalid payment owner' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner, 0));
  select * into v from public.sandbox_payments where id = (p_payment->>'id')::uuid for update;
  if found then
    if coalesce(v.owner_user_id::text,v.guest_session_hash) is distinct from v_owner
       or v.request_hash is distinct from p_payment->>'request_hash' then
      raise exception 'Payment intent conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('payment',to_jsonb(v),'claimed',false);
  end if;
  select * into v from public.sandbox_payments
   where coalesce(owner_user_id::text,guest_session_hash) = v_owner
     and checkout_hash = p_payment->>'checkout_hash'
     and (status in ('creating','pending','unknown') or (status = 'paid' and created_at > now() - interval '60 seconds'))
   order by created_at desc limit 1 for update;
  if found then return jsonb_build_object('payment',to_jsonb(v),'claimed',false); end if;
  insert into public.sandbox_payments(id,access_hash,request_hash,source,product_name,provider_code,target,amount,method,owner_user_id,guest_session_hash,checkout_hash)
    values((p_payment->>'id')::uuid,p_payment->>'access_hash',p_payment->>'request_hash',p_payment->>'source',p_payment->>'product_name',
      p_payment->>'provider_code',p_payment->>'target',(p_payment->>'amount')::bigint,p_payment->>'method',
      (p_payment->>'owner_user_id')::uuid,p_payment->>'guest_session_hash',p_payment->>'checkout_hash') returning * into v;
  return jsonb_build_object('payment',to_jsonb(v),'claimed',true);
end;
$$;

create function public.claim_sandbox_payment_check(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  update public.sandbox_payments set provider_check_until = now() + interval '30 seconds'
    where id = p_id and reference is not null
      and (provider_check_until is null or provider_check_until <= now())
    returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.audit_sandbox_payment() from public,anon,authenticated;
revoke all on function public.guard_sandbox_payment() from public,anon,authenticated;
revoke all on function public.consume_payment_rate(text,integer,integer) from public,anon,authenticated;
revoke all on function public.reserve_sandbox_payment(jsonb) from public,anon,authenticated;
revoke all on function public.claim_sandbox_payment_check(uuid) from public,anon,authenticated;
grant execute on function public.audit_sandbox_payment(), public.guard_sandbox_payment(),
  public.consume_payment_rate(text,integer,integer),public.reserve_sandbox_payment(jsonb),public.claim_sandbox_payment_check(uuid) to service_role;
commit;
