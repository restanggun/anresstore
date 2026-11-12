-- Jalankan di Supabase SQL Editor setelah public.users tersedia.
begin;
create table if not exists public.carts (
 user_id uuid primary key references public.users(id) on delete cascade,
 items jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.carts add column if not exists version bigint not null default 0;
create table if not exists public.cart_guest_imports (
 user_id uuid not null references public.users(id) on delete cascade,
 item_id text not null,
 primary key (user_id, item_id)
);
alter table public.carts enable row level security;
alter table public.cart_guest_imports enable row level security;
revoke all on public.carts, public.cart_guest_imports from anon, authenticated;
grant select, insert, update on public.carts to authenticated;
grant select, insert on public.cart_guest_imports to authenticated;
drop policy if exists "Users read own cart" on public.carts;
create policy "Users read own cart" on public.carts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own cart" on public.carts;
create policy "Users insert own cart" on public.carts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own cart" on public.carts;
create policy "Users update own cart" on public.carts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users read own imports" on public.cart_guest_imports;
create policy "Users read own imports" on public.cart_guest_imports for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own imports" on public.cart_guest_imports;
create policy "Users insert own imports" on public.cart_guest_imports for insert to authenticated with check ((select auth.uid()) = user_id);

-- Kunci baris mencegah dua perubahan menimpa satu sama lain.
-- Catatan impor membuat percobaan ulang aman setelah respons jaringan hilang.
create or replace function public.apply_cart(p_action text, p_items jsonb default '[]'::jsonb, p_version bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 uid uuid := auth.uid();
 current_cart public.carts%rowtype;
 entry jsonb;
 inserted_id text;
 changed boolean := false;
begin
 if uid is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
 if p_action not in ('load','merge','save') or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
   raise exception 'Invalid cart' using errcode = '22023';
 end if;
 insert into public.carts(user_id) values (uid) on conflict (user_id) do nothing;
 select * into current_cart from public.carts where user_id = uid for update;
 if p_action = 'save' then
   if p_version is null or current_cart.version <> p_version then
     return jsonb_build_object('conflict', true, 'items', current_cart.items, 'version', current_cart.version);
   end if;
   current_cart.items := p_items;
   changed := true;
 elsif p_action = 'merge' then
   for entry in select value from jsonb_array_elements(p_items) loop
     if jsonb_typeof(entry->'id') <> 'string' or length(entry->>'id') < 1 or length(entry->>'id') > 100 then
       raise exception 'Invalid item id' using errcode = '22023';
     end if;
     inserted_id := null;
     insert into public.cart_guest_imports(user_id,item_id) values(uid,entry->>'id')
       on conflict do nothing returning item_id into inserted_id;
     if inserted_id is not null and not exists (
       select 1 from jsonb_array_elements(current_cart.items) existing where existing->>'id' = entry->>'id'
     ) then
       current_cart.items := current_cart.items || jsonb_build_array(entry);
       changed := true;
     end if;
   end loop;
   if jsonb_array_length(current_cart.items) > 100 then raise exception 'Cart is full' using errcode = '22023'; end if;
 end if;
 if changed then
   update public.carts set items=current_cart.items, version=version+1, updated_at=now()
     where user_id=uid returning * into current_cart;
 end if;
 return jsonb_build_object('conflict', false, 'items', current_cart.items, 'version', current_cart.version);
end;
$$;
revoke all on function public.apply_cart(text,jsonb,bigint) from public, anon;
grant execute on function public.apply_cart(text,jsonb,bigint) to authenticated;
commit;