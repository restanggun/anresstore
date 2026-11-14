begin;
create table public.catalog_promotions (
  category text not null check (category in ('game','prepaid','apps')),
  item_code text not null check (item_code ~ '^[A-Za-z0-9._-]{1,120}$'),
  sale_price bigint not null check (sale_price between 1 and 100000000),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (category, item_code)
);
alter table public.catalog_promotions enable row level security;
revoke all on public.catalog_promotions from public, anon, authenticated;
grant select, insert, update on public.catalog_promotions to service_role;
commit;
