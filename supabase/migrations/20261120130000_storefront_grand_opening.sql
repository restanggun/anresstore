begin;

create table public.storefront_landing_settings (
  id integer primary key check (id = 1),
  revision integer not null default 0,
  config jsonb not null default '{"announcementEnabled":false,"announcementText":"","announcementHref":"","announcementLabel":"","announcementMoving":false,"startsAt":null,"endsAt":null,"closingTitle":"Mulai dari kebutuhanmu.","closingBody":"Temukan layanan digital yang kamu butuhkan.","showAuthCta":true}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now()
);
insert into public.storefront_landing_settings(id) values (1);
alter table public.storefront_landing_settings enable row level security;
revoke all on public.storefront_landing_settings from public, anon, authenticated;
grant select, insert, update on public.storefront_landing_settings to service_role;

create function public.save_storefront_landing_settings(p_actor uuid, p_revision integer, p_config jsonb)
returns table(revision integer)
language plpgsql security definer set search_path = '' as $$
begin
  update public.storefront_landing_settings s set config = p_config, revision = s.revision + 1, updated_at = now()
    where s.id = 1 and s.revision = p_revision returning s.revision into revision;
  if not found then return; end if;
  insert into public.admin_audit_log(actor_id, action, target)
    values (p_actor, 'storefront.landing.saved', revision::text);
  return next;
end;
$$;
revoke all on function public.save_storefront_landing_settings(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_storefront_landing_settings(uuid, integer, jsonb) to service_role;

create view public.storefront_landing_public_stats with (security_invoker = true) as
select
  ((select count(*) from public.live_transactions t where t.payment_mode = 'live' and t.payment_status = 'paid')
   + (select count(*) from public.premium_orders p where p.payment_mode = 'live' and p.status in ('paid','delivered')))::bigint as transaction_count,
  coalesce((select round(avg(r.rating)::numeric, 1) from public.product_reviews r where r.status = 'published'), 0)::numeric as average_rating,
  (select count(*)::integer from public.product_reviews r where r.status = 'published') as review_count,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id', rows.id, 'rating', rows.rating, 'comment', rows.comment,
    'category', rows.category, 'productSlug', rows.product_slug, 'createdAt', rows.created_at,
    'author', case when rows.reviewer_user_id is null then 'Pengunjung' else 'Pelanggan' end
  ) order by rows.created_at desc) from (
    select id, rating, comment, category, product_slug, created_at, reviewer_user_id
    from public.product_reviews where status = 'published' order by created_at desc, id limit 3
  ) rows), '[]'::jsonb) as recent_reviews;
revoke all on public.storefront_landing_public_stats from public, anon, authenticated;
grant select on public.storefront_landing_public_stats to service_role;

notify pgrst, 'reload schema';
commit;
