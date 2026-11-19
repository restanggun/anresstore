begin;

-- PostgreSQL requires dependent views to be recreated when a column type changes.
drop view public.storefront_landing_public_stats;
drop view public.product_review_summaries;

alter table public.product_reviews
  drop constraint product_reviews_rating_check,
  alter column rating type numeric,
  add constraint product_reviews_rating_check
    check (rating between 0.5 and 5 and mod(rating, 0.5) = 0);

create view public.product_review_summaries with (security_invoker = true) as
select category, product_slug, count(*)::integer as review_count,
  round(avg(rating), 1) as average_rating
from public.product_reviews
where status = 'published' and purchase_verified
group by category, product_slug;

create view public.storefront_landing_public_stats with (security_invoker = true) as
select
  (select count(*) from public.invoices i where i.payment_mode = 'live' and i.payment_status = 'paid') as transaction_count,
  coalesce((select round(avg(r.rating), 1) from public.product_reviews r where r.status = 'published' and r.purchase_verified), 0)::numeric as average_rating,
  (select count(*)::integer from public.product_reviews r where r.status = 'published' and r.purchase_verified) as review_count,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id', rows.id, 'rating', rows.rating, 'comment', rows.comment,
    'category', rows.category, 'productSlug', rows.product_slug, 'createdAt', rows.created_at,
    'author', case when rows.reviewer_user_id is null then 'Pengunjung' else 'Pelanggan' end
  ) order by rows.created_at desc, rows.id)
    from (select id, rating, comment, category, product_slug, created_at, reviewer_user_id
      from public.product_reviews
      where status = 'published' and purchase_verified
      order by created_at desc, id
      limit 3) rows), '[]'::jsonb) as recent_reviews;

revoke all on public.product_review_summaries, public.storefront_landing_public_stats from public, anon, authenticated;
grant select on public.product_review_summaries, public.storefront_landing_public_stats to service_role;

notify pgrst, 'reload schema';
commit;
