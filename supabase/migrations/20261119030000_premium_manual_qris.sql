begin;
create table public.premium_product_rules (
 product_id uuid primary key references public.managed_products(id) on delete cascade,
 access_type text not null check (access_type in ('private','sharing','other')),
 duration_days integer not null check (duration_days between 1 and 730),
 guarantee_days integer not null check (guarantee_days between 0 and 365),
 guarantee_terms text not null check (char_length(guarantee_terms) between 10 and 2000),
 updated_at timestamptz not null default now()
);
alter table public.premium_product_rules enable row level security;
revoke all on public.premium_product_rules from public,anon,authenticated;
grant select,insert,update on public.premium_product_rules to service_role;

create table public.premium_orders (
 id uuid primary key,
 user_id uuid not null references public.users(id) on delete restrict,
 product_id uuid not null references public.managed_products(id) on delete restrict,
 product_name text not null,
 access_type text not null,
 duration_days integer not null,
 guarantee_days integer not null,
 guarantee_terms text not null,
 amount bigint not null check (amount between 1 and 100000000),
 payment_mode text not null default 'live' check (payment_mode = 'live'),
 status text not null default 'awaiting_qr' check (status in ('awaiting_qr','awaiting_payment','proof_submitted','paid','delivered','closed','cancelled')),
 qr_image text check (char_length(qr_image) <= 180000),
 qr_expires_at timestamptz,
 proof_image text check (char_length(proof_image) <= 180000),
 proof_note text check (char_length(proof_note) <= 500),
 paid_at timestamptz,
 delivered_at timestamptz,
 conversation_id uuid unique references public.support_conversations(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index premium_orders_user_idx on public.premium_orders(user_id,created_at desc);
create index premium_orders_status_idx on public.premium_orders(status,created_at desc);
alter table public.premium_orders enable row level security;
revoke all on public.premium_orders from public,anon,authenticated;
grant select,insert,update on public.premium_orders to service_role;

create table public.premium_guarantee_claims (
 id uuid primary key,
 order_id uuid not null unique references public.premium_orders(id) on delete restrict,
 reason text not null check (char_length(reason) between 10 and 2000),
 status text not null default 'pending' check (status in ('pending','accepted','rejected','fulfilled')),
 admin_note text check (char_length(admin_note) <= 2000),
 created_at timestamptz not null default now(),
 decided_at timestamptz
);
alter table public.premium_guarantee_claims enable row level security;
revoke all on public.premium_guarantee_claims from public,anon,authenticated;
grant select,insert,update on public.premium_guarantee_claims to service_role;

create function public.reserve_premium_order(p_id uuid,p_user uuid,p_product uuid,p_amount bigint,p_rule_updated_at timestamptz)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare item public.managed_products; rule public.premium_product_rules; current_order public.premium_orders;
begin
 select * into item from public.managed_products where id=p_product and category='apps' and provider='manual' and active and deleted_at is null for share;
 select * into rule from public.premium_product_rules where product_id=p_product for share;
 if item.id is null or rule.product_id is null or item.price<>p_amount or rule.updated_at is distinct from p_rule_updated_at then raise exception 'Premium product unavailable or terms changed' using errcode='PT409'; end if;
 insert into public.premium_orders(id,user_id,product_id,product_name,access_type,duration_days,guarantee_days,guarantee_terms,amount)
 values(p_id,p_user,p_product,item.product||' - '||item.name,rule.access_type,rule.duration_days,rule.guarantee_days,rule.guarantee_terms,item.price)
 on conflict(id) do nothing;
 select * into current_order from public.premium_orders where id=p_id;
 if current_order.user_id<>p_user or current_order.product_id<>p_product or current_order.amount<>p_amount then raise exception 'Premium order conflict' using errcode='PT409'; end if;
 return next current_order;
end; $$;
revoke all on function public.reserve_premium_order(uuid,uuid,uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_premium_order(uuid,uuid,uuid,bigint,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
