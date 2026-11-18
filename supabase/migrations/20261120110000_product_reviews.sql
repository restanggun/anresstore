begin;

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('game','prepaid','apps','social','tasks')),
  product_slug text not null check (product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(product_slug) <= 100),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(btrim(comment)) between 5 and 1000),
  reviewer_email text not null check (
    char_length(reviewer_email) between 3 and 254 and reviewer_email=lower(btrim(reviewer_email))
    and reviewer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  reviewer_user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_reviews_email_once
  on public.product_reviews(category, product_slug, lower(reviewer_email));
create unique index product_reviews_account_once
  on public.product_reviews(category, product_slug, reviewer_user_id)
  where reviewer_user_id is not null;
create index product_reviews_public_product
  on public.product_reviews(category, product_slug, created_at desc)
  where status='published';
create index product_reviews_admin_queue
  on public.product_reviews(status, created_at desc);

alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.product_reviews to service_role;

create view public.product_review_summaries with (security_invoker=true) as
select category, product_slug, count(*)::integer as review_count,
  round(avg(rating)::numeric, 1) as average_rating
from public.product_reviews
where status='published'
group by category, product_slug;
revoke all on public.product_review_summaries from public, anon, authenticated;
grant select on public.product_review_summaries to service_role;

notify pgrst, 'reload schema';
commit;
