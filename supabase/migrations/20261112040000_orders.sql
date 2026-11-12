-- Jalankan setelah public.users tersedia. Data ini hanya untuk simulasi.
begin;
create table if not exists public.orders (
 id uuid primary key,
 user_id uuid not null references public.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 payment_method text not null check (payment_method in ('QRIS','Transfer bank','E-wallet')),
 items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100)
);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
alter table public.orders enable row level security;
revoke all on public.orders from public, anon, authenticated;
grant select, insert on public.orders to authenticated;
drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own orders" on public.orders;
create policy "Users create own orders" on public.orders for insert to authenticated with check ((select auth.uid()) = user_id);
commit;
