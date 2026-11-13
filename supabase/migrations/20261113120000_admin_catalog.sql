begin;
create table public.managed_products (
  id uuid primary key,
  provider text not null check (provider ~ '^[a-z0-9_-]{1,60}$'),
  provider_code text not null check (provider_code ~ '^[A-Za-z0-9._-]{1,120}$'),
  category text not null check (category in ('game','prepaid','apps')),
  product text not null check (char_length(product) between 1 and 100),
  product_slug text not null check (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 200),
  price bigint not null check (price between 1 and 100000000),
  description text not null default '',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, category, provider_code)
);
alter table public.managed_products enable row level security;
revoke all on public.managed_products from public, anon, authenticated;
grant select, insert, update on public.managed_products to service_role;
grant select on public.orders to service_role;
create index managed_products_category_idx on public.managed_products(category);
commit;
