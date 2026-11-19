begin;

create or replace function public.stage_admin_assistant_batch(p_id uuid, p_actor uuid, p_items jsonb)
returns table(expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'invalid assistant batch';
  end if;
  with drafts as (
    insert into public.admin_assistant_proposals(id,actor_id,product_id,category,product_slug,product_version,before_values,patch)
    select input.id,p_actor,input.product_id,input.category,input.product_slug,input.product_version,
      coalesce(input.before_values,jsonb_build_object('price',input.before_price)),
      coalesce(input.patch,jsonb_build_object('price',input.after_price))
    from jsonb_to_recordset(p_items) as input(
      id uuid,product_id uuid,category text,product_slug text,product_version timestamptz,
      before_price bigint,after_price bigint,before_values jsonb,patch jsonb
    )
    where jsonb_typeof(coalesce(input.before_values,jsonb_build_object('price',input.before_price))) = 'object'
      and jsonb_typeof(coalesce(input.patch,jsonb_build_object('price',input.after_price))) = 'object'
      and coalesce(input.patch,jsonb_build_object('price',input.after_price)) <> '{}'::jsonb
      and (coalesce(input.patch,jsonb_build_object('price',input.after_price)) - array['name','price','description','active']::text[]) = '{}'::jsonb
      and (not (coalesce(input.patch,jsonb_build_object('price',input.after_price)) ? 'price')
        or (coalesce(input.patch,jsonb_build_object('price',input.after_price)->>'price') ~ '^[0-9]+$'
          and (coalesce(input.patch,jsonb_build_object('price',input.after_price)->>'price')::numeric between 1 and 100000000)))
      and (not (coalesce(input.patch,jsonb_build_object('price',input.after_price)) ? 'active')
        or coalesce(input.patch,jsonb_build_object('price',input.after_price)->'active') in ('true'::jsonb,'false'::jsonb))
      and (not (coalesce(input.patch,jsonb_build_object('price',input.after_price)) ? 'name')
        or length(coalesce(coalesce(input.patch,jsonb_build_object('price',input.after_price))->>'name','')) between 1 and 200)
      and (not (coalesce(input.patch,jsonb_build_object('price',input.after_price)) ? 'description')
        or length(coalesce(coalesce(input.patch,jsonb_build_object('price',input.after_price))->>'description','')) <= 2000)
    returning id
  ) select array_agg(drafts.id) into ids from drafts;
  if cardinality(ids) is distinct from jsonb_array_length(p_items) then raise exception 'invalid assistant patch'; end if;
  return query insert into public.admin_assistant_batches as b(id,actor_id,proposal_ids)
    values(p_id,p_actor,ids) returning b.expires_at;
end;
$$;

create table public.admin_assistant_action_drafts (
  id uuid primary key,
  actor_id uuid not null,
  action_type text not null check (action_type in ('product_create','product_batch','promotion_save','voucher_save')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  applied_at timestamptz
);
alter table public.admin_assistant_action_drafts enable row level security;
revoke all on public.admin_assistant_action_drafts from public, anon, authenticated;
grant select, insert, update on public.admin_assistant_action_drafts to service_role;

commit;
