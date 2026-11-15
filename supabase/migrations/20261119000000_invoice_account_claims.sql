begin;
alter table public.payments add column claimed_user_id uuid references auth.users(id) on delete restrict, add column claimed_at timestamptz;
alter table public.payments add constraint payment_claim_consistent check (
 (claimed_user_id is null and claimed_at is null) or (claimed_user_id is not null and claimed_at is not null and owner_user_id is null and guest_session_hash is not null)
);
create index payment_claimed_owner_idx on public.payments(claimed_user_id,created_at desc) where claimed_user_id is not null;
create table public.invoice_claim_events (
 payment_id uuid primary key references public.payments(id), user_id uuid not null references auth.users(id),
 method text not null check(method in ('guest_cookie','email_otp')), created_at timestamptz not null default now()
);
create table public.invoice_recovery_challenges (
 id uuid primary key, user_id uuid not null references auth.users(id), payment_id uuid references public.payments(id),
 email text not null, payment_mode text not null check(payment_mode in ('sandbox','live')),
 attempts integer not null default 0 check(attempts between 0 and 5), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes', consumed_at timestamptz
);
create index invoice_recovery_expiry_idx on public.invoice_recovery_challenges(expires_at);
alter table public.invoice_claim_events enable row level security;
alter table public.invoice_recovery_challenges enable row level security;
revoke all on public.invoice_claim_events,public.invoice_recovery_challenges from public,anon,authenticated;
grant select,insert on public.invoice_claim_events to service_role;
grant select,insert,update,delete on public.invoice_recovery_challenges to service_role;
create function public.guard_invoice_claim() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.claimed_user_id is not null or new.claimed_at is not null then raise exception 'Invoice cannot be preclaimed' using errcode='23514'; end if;
 elsif row(old.claimed_user_id,old.claimed_at) is distinct from row(new.claimed_user_id,new.claimed_at) then
  if old.claimed_user_id is not null or new.claimed_user_id is null or new.owner_user_id is not null
   or current_setting('anres.invoice_claim',true) is distinct from new.claimed_user_id::text then
   raise exception 'Invoice ownership claim unavailable' using errcode='23514';
  end if;
 end if;
 return new;
end; $$;
create trigger guard_invoice_claim before insert or update on public.payments for each row execute function public.guard_invoice_claim();
-- Keep original guest/order snapshots immutable; project the permanent account separately.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.project_payment_order()'::regprocedure);
 definition:=replace(definition,'new.owner_user_id,decode','coalesce(new.owner_user_id,new.claimed_user_id),decode');
 definition:=replace(definition,'on conflict(id) do update set payment_reference=','on conflict(id) do update set user_id=excluded.user_id,payment_reference=');
 execute definition;
 if to_regprocedure('public.reserve_payment_snapshot(jsonb)') is not null then
  definition:=pg_get_functiondef('public.reserve_payment_snapshot(jsonb)'::regprocedure);
 else
  definition:=pg_get_functiondef('public.reserve_payment(jsonb)'::regprocedure);
 end if;
 definition:=replace(definition,'coalesce(v.owner_user_id::text,v.guest_session_hash)','coalesce(v.owner_user_id::text,v.claimed_user_id::text,v.guest_session_hash)');
 definition:=replace(definition,'coalesce(owner_user_id::text,guest_session_hash)','coalesce(owner_user_id::text,claimed_user_id::text,guest_session_hash)');
 execute definition;
 definition:=pg_get_functiondef('public.request_payment_refund(uuid,uuid,text,text,text,text,text)'::regprocedure);
 definition:=replace(definition,'payment.owner_user_id=p_user','coalesce(payment.owner_user_id,payment.claimed_user_id)=p_user');
 definition:=replace(definition,'payment.owner_user_id is null and payment.guest_session_hash','payment.owner_user_id is null and payment.claimed_user_id is null and payment.guest_session_hash');
 execute definition;
end; $$;
create function public.attach_guest_invoices(p_user uuid,p_guest_hash text,p_email text,p_mode text) returns integer
language plpgsql security definer set search_path='' as $$
declare payment record; total integer:=0;
begin
 if p_user is null or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$' or p_mode not in ('live','sandbox') then return 0; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(btrim(email))=lower(btrim(p_email))) then return 0; end if;
 perform set_config('anres.invoice_claim',p_user::text,true);
 for payment in select id from public.payments where owner_user_id is null and claimed_user_id is null
  and guest_session_hash=p_guest_hash and payment_mode=p_mode and lower(btrim(customer_email))=lower(btrim(p_email))
  and created_at between now()-interval '30 days' and now()+interval '1 minute' order by id for update loop
  update public.payments set claimed_user_id=p_user,claimed_at=now(),revision=revision+1,updated_at=now() where id=payment.id;
  insert into public.invoice_claim_events(payment_id,user_id,method) values(payment.id,p_user,'guest_cookie');
  total:=total+1;
 end loop;
 return total;
end; $$;
create function public.start_invoice_recovery(p_id uuid,p_user uuid,p_invoice text,p_email text,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare payment_id uuid;
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(btrim(email))=lower(btrim(p_email))) then raise exception 'Verified account required' using errcode='42501'; end if;
 select id into payment_id from public.payments where (invoice_number=p_invoice or id::text=lower(p_invoice)) and payment_mode=p_mode
  and owner_user_id is null and (claimed_user_id is null or claimed_user_id=p_user) and lower(btrim(customer_email))=lower(btrim(p_email));
 delete from public.invoice_recovery_challenges where expires_at<now()-interval '1 day';
 update public.invoice_recovery_challenges set expires_at=now() where user_id=p_user and consumed_at is null;
 -- A dummy challenge has the same response and email flow, without revealing invoice existence.
 insert into public.invoice_recovery_challenges(id,user_id,payment_id,email,payment_mode) values(p_id,p_user,payment_id,lower(btrim(p_email)),p_mode);
end; $$;
create function public.consume_invoice_recovery_attempt(p_id uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare challenge public.invoice_recovery_challenges;
begin
 select * into challenge from public.invoice_recovery_challenges where id=p_id and user_id=p_user for update;
 if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 then return false; end if;
 update public.invoice_recovery_challenges set attempts=attempts+1 where id=p_id;
 return true;
end; $$;
create function public.complete_invoice_recovery(p_id uuid,p_user uuid,p_email text) returns text
language plpgsql security definer set search_path='' as $$
declare challenge public.invoice_recovery_challenges; payment public.payments;
begin
 select * into challenge from public.invoice_recovery_challenges where id=p_id and user_id=p_user for update;
 if not found or challenge.payment_id is null or challenge.consumed_at is not null or challenge.expires_at<=now()
  or challenge.attempts<1 or challenge.attempts>5 or challenge.email<>lower(btrim(p_email)) then return null; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(btrim(email))=challenge.email) then return null; end if;
 select * into payment from public.payments where id=challenge.payment_id for update;
 if not found or payment.owner_user_id is not null or payment.payment_mode<>challenge.payment_mode
  or lower(btrim(payment.customer_email))<>challenge.email or payment.claimed_user_id is not null and payment.claimed_user_id<>p_user then return null; end if;
 if payment.claimed_user_id is null then
  perform set_config('anres.invoice_claim',p_user::text,true);
  update public.payments set claimed_user_id=p_user,claimed_at=now(),revision=revision+1,updated_at=now() where id=payment.id;
  insert into public.invoice_claim_events(payment_id,user_id,method) values(payment.id,p_user,'email_otp');
 end if;
 update public.invoice_recovery_challenges set consumed_at=now() where id=p_id;
 return payment.invoice_number;
end; $$;
revoke all on function public.guard_invoice_claim(),public.attach_guest_invoices(uuid,text,text,text),public.start_invoice_recovery(uuid,uuid,text,text,text),public.consume_invoice_recovery_attempt(uuid,uuid),public.complete_invoice_recovery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.guard_invoice_claim(),public.attach_guest_invoices(uuid,text,text,text),public.start_invoice_recovery(uuid,uuid,text,text,text),public.consume_invoice_recovery_attempt(uuid,uuid),public.complete_invoice_recovery(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
