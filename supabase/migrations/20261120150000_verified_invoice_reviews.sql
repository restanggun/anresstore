begin;

alter table public.payments add column if not exists product_slug text;
alter table public.payments add constraint payments_product_slug_format
  check(product_slug is null or product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(product_slug)<=100);

-- One canonical invoice registry backs regular checkout and premium app orders.
create table public.invoices (
  id uuid primary key,
  invoice_number text not null unique,
  order_kind text not null check(order_kind in ('payment','premium')),
  payment_id uuid unique references public.payments(id) on delete restrict,
  premium_order_id uuid unique references public.premium_orders(id) on delete restrict,
  owner_user_id uuid references public.users(id) on delete restrict,
  claimed_user_id uuid references public.users(id) on delete restrict,
  guest_session_hash text check(guest_session_hash is null or guest_session_hash ~ '^[a-f0-9]{64}$'),
  category text not null check(category in ('game','prepaid','apps','social','tasks')),
  product_slug text check(product_slug is null or (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(product_slug)<=100)),
  product_name text not null,
  source_method text not null,
  amount bigint not null check(amount between 0 and 100000000),
  payment_mode text not null check(payment_mode in ('live','sandbox')),
  payment_status text not null,
  fulfillment_status text not null,
  customer_email text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check(num_nonnulls(payment_id,premium_order_id)=1),
  check((order_kind='payment' and payment_id is not null and premium_order_id is null) or
        (order_kind='premium' and premium_order_id is not null and payment_id is null)),
  check((owner_user_id is not null or claimed_user_id is not null) or guest_session_hash is not null)
);
create index invoices_owner_idx on public.invoices(coalesce(owner_user_id,claimed_user_id),created_at desc);
create index invoices_guest_idx on public.invoices(guest_session_hash,created_at desc) where guest_session_hash is not null;
create index invoices_product_idx on public.invoices(category,product_slug,created_at desc);
alter table public.invoices enable row level security;
revoke all on public.invoices from public,anon,authenticated;
grant select,insert,update on public.invoices to service_role;

create or replace function public.sync_payment_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
declare delivery public.live_transactions;
begin
  select * into delivery from public.live_transactions where id=new.id;
  insert into public.invoices(id,invoice_number,order_kind,payment_id,owner_user_id,claimed_user_id,guest_session_hash,
    category,product_slug,product_name,source_method,amount,payment_mode,payment_status,fulfillment_status,customer_email,created_at,updated_at)
  values(new.id,new.invoice_number,'payment',new.id,new.owner_user_id,new.claimed_user_id,new.guest_session_hash,
    new.source,new.product_slug,new.product_name,new.method,new.amount,new.payment_mode,new.status,
    coalesce(delivery.fulfillment_status,'not_ready'),new.customer_email,new.created_at,now())
  on conflict(id) do update set invoice_number=excluded.invoice_number,owner_user_id=excluded.owner_user_id,
    claimed_user_id=excluded.claimed_user_id,guest_session_hash=excluded.guest_session_hash,product_slug=excluded.product_slug,
    product_name=excluded.product_name,source_method=excluded.source_method,amount=excluded.amount,
    payment_status=excluded.payment_status,fulfillment_status=coalesce(delivery.fulfillment_status,public.invoices.fulfillment_status),
    customer_email=excluded.customer_email,updated_at=now()
  where public.invoices.payment_id=excluded.payment_id;
  return new;
end; $$;
create trigger sync_payment_invoice after insert or update on public.payments
for each row execute function public.sync_payment_invoice();

create or replace function public.sync_premium_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
declare slug text; pay_status text; fulfill_status text;
begin
  select product_slug into slug from public.managed_products where id=new.product_id;
  pay_status:=case when new.status in ('paid','delivered','closed') then 'paid'
    when new.status='cancelled' then 'cancelled' else 'pending' end;
  fulfill_status:=case when new.status in ('delivered','closed') then 'completed'
    when new.status='paid' then 'processing' when new.status='cancelled' then 'failed' else 'not_ready' end;
  insert into public.invoices(id,invoice_number,order_kind,premium_order_id,owner_user_id,guest_session_hash,
    category,product_slug,product_name,source_method,amount,payment_mode,payment_status,fulfillment_status,customer_email,created_at,updated_at)
  values(new.id,new.invoice_number,'premium',new.id,new.user_id,new.guest_session_hash,
    'apps',slug,new.product_name,'QRIS',new.amount,new.payment_mode,pay_status,fulfill_status,new.customer_email,new.created_at,now())
  on conflict(id) do update set invoice_number=excluded.invoice_number,owner_user_id=excluded.owner_user_id,
    guest_session_hash=excluded.guest_session_hash,product_slug=excluded.product_slug,product_name=excluded.product_name,
    amount=excluded.amount,payment_status=excluded.payment_status,fulfillment_status=excluded.fulfillment_status,
    customer_email=excluded.customer_email,updated_at=now()
  where public.invoices.premium_order_id=excluded.premium_order_id;
  return new;
end; $$;
create trigger sync_premium_invoice after insert or update on public.premium_orders
for each row execute function public.sync_premium_invoice();

create or replace function public.sync_live_invoice_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.invoices set payment_status=new.payment_status,fulfillment_status=new.fulfillment_status,updated_at=now()
    where payment_id=new.id;
  return new;
end; $$;
create trigger sync_live_invoice_status after insert or update of payment_status,fulfillment_status on public.live_transactions
for each row execute function public.sync_live_invoice_status();

insert into public.invoices(id,invoice_number,order_kind,payment_id,owner_user_id,claimed_user_id,guest_session_hash,
  category,product_slug,product_name,source_method,amount,payment_mode,payment_status,fulfillment_status,customer_email,created_at,updated_at)
select p.id,p.invoice_number,'payment',p.id,p.owner_user_id,p.claimed_user_id,p.guest_session_hash,p.source,p.product_slug,
  p.product_name,p.method,p.amount,p.payment_mode,p.status,coalesce(t.fulfillment_status,'not_ready'),p.customer_email,p.created_at,now()
from public.payments p left join public.live_transactions t on t.id=p.id
on conflict(id) do nothing;
insert into public.invoices(id,invoice_number,order_kind,premium_order_id,owner_user_id,guest_session_hash,
  category,product_slug,product_name,source_method,amount,payment_mode,payment_status,fulfillment_status,customer_email,created_at,updated_at)
select o.id,o.invoice_number,'premium',o.id,o.user_id,o.guest_session_hash,'apps',m.product_slug,o.product_name,'QRIS',o.amount,o.payment_mode,
  case when o.status in ('paid','delivered','closed') then 'paid' when o.status='cancelled' then 'cancelled' else 'pending' end,
  case when o.status in ('delivered','closed') then 'completed' when o.status='paid' then 'processing' when o.status='cancelled' then 'failed' else 'not_ready' end,
  o.customer_email,o.created_at,now()
from public.premium_orders o join public.managed_products m on m.id=o.product_id
on conflict(id) do nothing;

alter table public.product_reviews
  add column if not exists invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists purchase_verified boolean not null default false,
  add constraint product_reviews_purchase_proof check (not purchase_verified or invoice_id is not null);

drop index if exists public.product_reviews_email_once;
drop index if exists public.product_reviews_account_once;
update public.product_reviews set status='hidden',updated_at=now()
  where status='published' and (not purchase_verified or invoice_id is null);
create unique index if not exists product_reviews_invoice_once
  on public.product_reviews(invoice_id) where invoice_id is not null;
create index if not exists product_reviews_verified_product
  on public.product_reviews(category, product_slug, created_at desc)
  where purchase_verified and status='published';

create or replace view public.product_review_summaries with (security_invoker=true) as
select category, product_slug, count(*)::integer as review_count,
  round(avg(rating)::numeric, 1) as average_rating
from public.product_reviews
where status='published' and purchase_verified
group by category, product_slug;

revoke all on public.product_review_summaries from public,anon,authenticated;
grant select on public.product_review_summaries to service_role;

create or replace view public.storefront_landing_public_stats with (security_invoker=true) as
select
  (select count(*) from public.invoices i where i.payment_mode='live' and i.payment_status='paid')::bigint as transaction_count,
  coalesce((select round(avg(r.rating)::numeric,1) from public.product_reviews r where r.status='published' and r.purchase_verified),0)::numeric as average_rating,
  (select count(*)::integer from public.product_reviews r where r.status='published' and r.purchase_verified) as review_count,
  coalesce((select jsonb_agg(jsonb_build_object('id',rows.id,'rating',rows.rating,'comment',rows.comment,
    'category',rows.category,'productSlug',rows.product_slug,'createdAt',rows.created_at,
    'author',case when rows.reviewer_user_id is null then 'Pengunjung' else 'Pelanggan' end) order by rows.created_at desc)
    from (select id,rating,comment,category,product_slug,created_at,reviewer_user_id from public.product_reviews
      where status='published' and purchase_verified order by created_at desc,id limit 3) rows),'[]'::jsonb) as recent_reviews;
revoke all on public.storefront_landing_public_stats from public,anon,authenticated;
grant select on public.storefront_landing_public_stats to service_role;

-- Extend the existing reservation snapshot without replacing its identity checks.
do $$
declare definition text; revised text;
begin
  definition := pg_get_functiondef('public.reserve_payment_snapshot(jsonb)'::regprocedure);
  revised := replace(definition, 'invoice_product_code,invoice_subproduct_code)',
    'invoice_product_code,invoice_subproduct_code,product_slug)');
  if revised = definition then raise exception 'Payment snapshot insert columns not found'; end if;
  definition := revised;
  revised := replace(definition, $value$p_payment->>'invoice_subproduct_code')$value$,
    $value$p_payment->>'invoice_subproduct_code',p_payment->>'product_slug')$value$);
  if revised = definition then raise exception 'Payment snapshot insert values not found'; end if;
  execute revised;
end; $$;

create or replace function public.guard_payment_product_slug() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.product_slug is distinct from old.product_slug then
    raise exception 'Immutable payment product slug' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger guard_payment_product_slug before update on public.payments for each row execute function public.guard_payment_product_slug();
revoke all on function public.guard_payment_product_slug() from public,anon,authenticated;
grant execute on function public.guard_payment_product_slug() to service_role;
revoke all on function public.sync_payment_invoice(),public.sync_premium_invoice(),public.sync_live_invoice_status() from public,anon,authenticated;
grant execute on function public.sync_payment_invoice(),public.sync_premium_invoice(),public.sync_live_invoice_status() to service_role;

notify pgrst, 'reload schema';
commit;
