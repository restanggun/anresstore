begin;

create or replace function public.stage_admin_assistant_batch(p_id uuid, p_actor uuid, p_items jsonb)
returns table(expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid assistant batch';
  end if;
  with drafts as (
    insert into public.admin_assistant_proposals(id,actor_id,product_id,category,product_slug,product_version,before_values,patch)
    select input.id,p_actor,input.product_id,input.category,input.product_slug,input.product_version,
      normalized.before_values,normalized.patch
    from jsonb_to_recordset(p_items) as input(
      id uuid,product_id uuid,category text,product_slug text,product_version timestamptz,
      before_price bigint,after_price bigint,before_values jsonb,patch jsonb
    )
    cross join lateral (
      select coalesce(input.before_values,jsonb_build_object('price',input.before_price)) as before_values,
        coalesce(input.patch,jsonb_build_object('price',input.after_price)) as patch
    ) as normalized
    where jsonb_typeof(normalized.before_values) = 'object'
      and jsonb_typeof(normalized.patch) = 'object'
      and normalized.patch <> '{}'::jsonb
      and (normalized.patch - array['name','price','description','active']::text[]) = '{}'::jsonb
      and (not (normalized.patch ? 'price') or case
        when (normalized.patch->>'price') ~ '^[0-9]+$'
          then (normalized.patch->>'price')::numeric between 1 and 100000000
        else false end)
      and (not (normalized.patch ? 'active') or normalized.patch->'active' in ('true'::jsonb,'false'::jsonb))
      and (not (normalized.patch ? 'name') or length(coalesce(normalized.patch->>'name','')) between 1 and 200)
      and (not (normalized.patch ? 'description') or length(coalesce(normalized.patch->>'description','')) <= 2000)
    returning id
  ) select array_agg(drafts.id) into ids from drafts;
  if cardinality(ids) is distinct from jsonb_array_length(p_items) then raise exception 'invalid assistant patch'; end if;
  return query insert into public.admin_assistant_batches as b(id,actor_id,proposal_ids)
    values(p_id,p_actor,ids) returning b.expires_at;
end;
$$;

commit;
