begin;

alter table public.reseller_settings add column hosted_commission_percent integer not null default 0
  check(hosted_commission_percent between 0 and 80);

create table public.reseller_checkout_links (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(user_id),
  category text not null check(category in ('game','prepaid')),
  code text not null check(char_length(code) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  payment_id uuid unique references public.payments(id),
  commission integer check(commission between 1 and 100000000),
  completed_at timestamptz,
  payout_amount integer check(payout_amount between 1 and commission),
  payout_reference text unique check(char_length(payout_reference) between 6 and 100),
  paid_out_at timestamptz,
  check((payment_id is null)=(commission is null)),
  check(num_nonnulls(payout_amount,payout_reference,paid_out_at) in (0,3))
);
create index reseller_checkout_links_owner_idx on public.reseller_checkout_links(reseller_id,created_at desc);
create table public.reseller_commission_adjustments (
  link_id uuid not null references public.reseller_checkout_links(id),
  reference text primary key check(char_length(reference) between 6 and 100),
  amount integer not null check(amount between 1 and 100000000),
  recorded_at timestamptz not null default now()
);
create index reseller_commission_adjustments_link_idx on public.reseller_commission_adjustments(link_id);
alter table public.reseller_checkout_links enable row level security;
alter table public.reseller_commission_adjustments enable row level security;
revoke all on public.reseller_checkout_links,public.reseller_commission_adjustments from public,anon,authenticated;
grant select,insert,update on public.reseller_checkout_links to service_role;
grant select,insert on public.reseller_commission_adjustments to service_role;

create function public.reseller_owns_billing_email(p_user uuid,p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=p_user and lower(btrim(email))=lower(btrim(p_email)))
$$;
revoke all on function public.reseller_owns_billing_email(uuid,text) from public,anon,authenticated;
grant execute on function public.reseller_owns_billing_email(uuid,text) to service_role;

create function public.reserve_hosted_reseller_payment(p_payment jsonb,p_link uuid,p_percent integer,p_commission integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  shop public.reseller_checkout_links;
  settings integer;
  member text;
  starter_price integer;
  result jsonb;
begin
  select * into shop from public.reseller_checkout_links where id=p_link for update;
  if not found or shop.category<>p_payment->>'source' or shop.code<>p_payment->>'provider_code'
    or p_payment->>'payment_mode'<>'live' or p_payment->>'method'='VOUCHER'
    or (p_payment->>'owner_user_id')::uuid=shop.reseller_id
    or public.reseller_owns_billing_email(shop.reseller_id,p_payment->>'customer_email')
    then raise exception 'Checkout unavailable' using errcode='PT409'; end if;
  if shop.payment_id is not null then
    if shop.payment_id<>(p_payment->>'id')::uuid
      then raise exception 'Checkout already used' using errcode='PT409'; end if;
    return public.reserve_payment(p_payment);
  end if;
  select hosted_commission_percent into settings from public.reseller_settings where id=1 for share;
  select status into member from public.resellers where user_id=shop.reseller_id for share;
  select starter into starter_price from public.reseller_prices where category=shop.category and code=shop.code for share;
  if shop.expires_at<=now() or member is distinct from 'approved'
    or not (public.reseller_progress(shop.reseller_id)->>'activated')::boolean
    or settings<=0 or settings is distinct from p_percent
    or starter_price is null or starter_price<=coalesce((p_payment->>'provider_cost')::integer,0)
    or p_commission<1 or p_commission is distinct from
      (((p_payment->>'amount')::bigint-starter_price)*settings/100)::integer
    then raise exception 'Checkout terms changed' using errcode='PT409'; end if;
  result := public.reserve_payment(p_payment);
  if (result->'payment'->>'id')::uuid is distinct from (p_payment->>'id')::uuid
    or not coalesce((result->>'claimed')::boolean,false)
    then raise exception 'Checkout reservation conflict' using errcode='PT409'; end if;
  update public.reseller_checkout_links set payment_id=(p_payment->>'id')::uuid,commission=p_commission where id=p_link;
  return result;
end
$$;

create function public.mark_reseller_checkout_completed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.payment_status='paid' and new.fulfillment_status='completed' and new.payment_mode='live' then
    update public.reseller_checkout_links set completed_at=now()
      where payment_id=new.payment_id and completed_at is null;
  end if;
  return new;
end
$$;
create trigger mark_reseller_checkout_completed after update of payment_status,fulfillment_status on public.invoices
for each row execute function public.mark_reseller_checkout_completed();

create view public.reseller_checkout_status with (security_invoker=true) as
with amounts as (
  select l.*,i.invoice_number,i.amount,i.payment_status,i.fulfillment_status,
    coalesce(r.pending,false) as refund_pending,coalesce(a.recovered,0) as recovered,
    case when i.payment_status='paid' and i.fulfillment_status='completed' then
      floor(l.commission::numeric * greatest(0,i.amount-coalesce(r.amount,0)) / nullif(i.amount,0))::integer
    else 0 end as earned
  from public.reseller_checkout_links l
  left join public.invoices i on i.payment_id=l.payment_id
  left join lateral (
    select sum(refund_amount) filter(where refund_status='completed') amount,
      bool_or(refund_status in ('requested','in_review')) pending
      from public.support_conversations where payment_id=l.payment_id
  ) r on true
  left join lateral (
    select sum(amount) recovered from public.reseller_commission_adjustments where link_id=l.id
  ) a on true
)
select *,greatest(0,coalesce(payout_amount,0)-earned-recovered) as adjustment_due,case
  when paid_out_at is not null and earned+recovered<payout_amount then 'adjustment'
  when recovered>0 then 'reconciled'
  when paid_out_at is not null then 'paid_out'
  when payment_id is null and expires_at<=now() then 'expired'
  when payment_id is null then 'open'
  when payment_status in ('refunded','failed','expired') or fulfillment_status='failed' then 'void'
  when completed_at is not null and coalesce(earned,0)=0 then 'void'
  when refund_pending then 'holding'
  when earned>0 and completed_at<=now()-interval '14 days' then 'payable'
  when earned>0 then 'holding'
  else 'pending'
end as state from amounts;

create function public.record_reseller_payout(p_link uuid,p_amount integer,p_reference text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
  shop public.reseller_checkout_links;
  current_status public.reseller_checkout_status;
begin
  select * into shop from public.reseller_checkout_links where id=p_link for update;
  if not found then raise exception 'Checkout unavailable' using errcode='PT409'; end if;
  if shop.paid_out_at is not null then
    if shop.payout_amount=p_amount and shop.payout_reference=p_reference then return true; end if;
    raise exception 'Payout already recorded' using errcode='PT409';
  end if;
  select * into current_status from public.reseller_checkout_status where id=p_link;
  if current_status.state<>'payable' or current_status.earned is distinct from p_amount
    or exists (
      select 1 from public.reseller_checkout_status where reseller_id=shop.reseller_id and state='adjustment'
    ) then raise exception 'Review payout eligibility or refund adjustment' using errcode='PT409'; end if;
  update public.reseller_checkout_links set payout_amount=p_amount,payout_reference=p_reference,paid_out_at=now() where id=p_link;
  return true;
end
$$;

create function public.record_reseller_adjustment(p_link uuid,p_amount integer,p_reference text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
  previous public.reseller_commission_adjustments;
  due bigint;
begin
  perform 1 from public.reseller_checkout_links where id=p_link for update;
  if not found then raise exception 'Checkout unavailable' using errcode='PT409'; end if;
  select * into previous from public.reseller_commission_adjustments where reference=p_reference;
  if found then
    if previous.link_id=p_link and previous.amount=p_amount then return true; end if;
    raise exception 'Adjustment reference already recorded' using errcode='PT409';
  end if;
  select adjustment_due into due from public.reseller_checkout_status where id=p_link;
  if p_amount is null or p_amount<1 or p_amount>due
    then raise exception 'Adjustment amount changed' using errcode='PT409'; end if;
  insert into public.reseller_commission_adjustments(link_id,reference,amount) values(p_link,p_reference,p_amount);
  return true;
end
$$;

revoke all on public.reseller_checkout_status from public,anon,authenticated;
grant select on public.reseller_checkout_status to service_role;
revoke all on function public.reserve_hosted_reseller_payment(jsonb,uuid,integer,integer),public.mark_reseller_checkout_completed(),public.record_reseller_payout(uuid,integer,text),public.record_reseller_adjustment(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_hosted_reseller_payment(jsonb,uuid,integer,integer),public.mark_reseller_checkout_completed(),public.record_reseller_payout(uuid,integer,text),public.record_reseller_adjustment(uuid,integer,text) to service_role;
notify pgrst, 'reload schema';
commit;
