begin;
create table public.catalog_versions (
  category text primary key check(category in ('game','prepaid','apps','social','tasks')),
  version bigint not null default 0
);
insert into public.catalog_versions(category) values ('game'),('prepaid'),('apps'),('social'),('tasks');
alter table public.catalog_versions enable row level security;
revoke all on public.catalog_versions from public,anon,authenticated;
grant select,update on public.catalog_versions to service_role;

create function public.bump_catalog_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Updating this row serializes catalog changes against payment reservations.
  update public.catalog_versions set version=version+1 where category=coalesce(new.category,old.category);
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
create trigger managed_catalog_version before insert or update or delete on public.managed_products
for each row execute function public.bump_catalog_version();
create trigger promotion_catalog_version before insert or update or delete on public.catalog_promotions
for each row execute function public.bump_catalog_version();

alter function public.reserve_payment(jsonb) rename to reserve_payment_snapshot;
create function public.reserve_payment(p_payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_version bigint;
begin
  if p_payment->>'catalog_revision' is not null then
    -- Hold through reservation commit: an admin write either precedes this
    -- check (and is rejected as stale) or follows the immutable invoice snapshot.
    select version into current_version from public.catalog_versions
      where category=p_payment->>'source' for share;
    if current_version is null or current_version::text <> p_payment->>'catalog_revision' then
      raise exception 'Catalog changed before payment reservation' using errcode='PT409';
    end if;
  end if;
  return public.reserve_payment_snapshot(p_payment);
end; $$;
revoke all on function public.bump_catalog_version(),public.reserve_payment(jsonb),public.reserve_payment_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.bump_catalog_version(),public.reserve_payment(jsonb),public.reserve_payment_snapshot(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
