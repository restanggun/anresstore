-- Jalankan di Supabase SQL Editor sebagai pemilik proyek.
-- auth.users tetap menjadi sumber autentikasi; public.users menyimpan data aplikasi.
begin;
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (full_name, updated_at) on public.users to authenticated;
drop policy if exists "Users read own data" on public.users;
create policy "Users read own data" on public.users for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "Users update own data" on public.users;
create policy "Users update own data" on public.users for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- SECURITY DEFINER diperlukan karena pembuatan auth.users dilakukan oleh Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 100))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_anres on auth.users;
create trigger on_auth_user_created_anres after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Salin nama yang sudah tersimpan pada tabel lama jika tabel tersebut ada.
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'insert into public.users (id, full_name, updated_at)
      select p.id, p.full_name, p.updated_at from public.profiles p
      join auth.users a on a.id = p.id on conflict (id) do nothing';
  end if;
end;
$$;
-- Lengkapi akun yang sudah ada, termasuk yang belum pernah menyimpan profil.
insert into public.users (id, full_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), 100)
from auth.users on conflict (id) do nothing;
commit;
