-- Some foundation migrations were applied manually before CLI history existed.
-- Reconcile missing relations without recreating or replacing existing data.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon;
grant select,insert,update on public.profiles to authenticated;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid())=id);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check ((select auth.uid())=id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

create table if not exists public.support_requests (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 10 and 3000),
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public,anon,authenticated;
grant select,insert,update on public.support_requests to service_role;

create table if not exists public.guest_order_access (
  order_id uuid primary key references public.live_transactions(id) on delete cascade,
  token_hash bytea not null check (octet_length(token_hash)=32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.guest_order_access enable row level security;
revoke all on public.guest_order_access from public,anon,authenticated;
grant select,insert,update on public.guest_order_access to service_role;
notify pgrst, 'reload schema';
commit;
