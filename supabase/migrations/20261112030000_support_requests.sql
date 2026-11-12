-- Jalankan di Supabase SQL Editor. Hanya backend dengan secret/service role yang dapat mengakses.
begin;
create table if not exists public.support_requests (
 id uuid primary key,
 name text not null check (char_length(name) between 1 and 100),
 email text not null check (char_length(email) between 3 and 254),
 message text not null check (char_length(message) between 10 and 3000),
 status text not null default 'new' check (status in ('new','in_progress','closed')),
 created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant select, insert, update on public.support_requests to service_role;
commit;
