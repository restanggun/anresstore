begin;

create table public.admin_assistant_proposals (
  id uuid primary key,
  actor_id uuid not null,
  product_id uuid not null,
  category text not null,
  product_slug text not null,
  product_version timestamptz not null,
  before_values jsonb not null,
  patch jsonb not null check (jsonb_typeof(patch) = 'object' and patch <> '{}'::jsonb
    and (patch - array['name','price','description','active']::text[]) = '{}'::jsonb),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  applied_at timestamptz
);

alter table public.admin_assistant_proposals enable row level security;
revoke all on public.admin_assistant_proposals from public, anon, authenticated;
grant select, insert on public.admin_assistant_proposals to service_role;

create function public.apply_admin_assistant_proposal(p_id uuid, p_actor uuid)
returns table (result text, product_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  draft public.admin_assistant_proposals%rowtype;
  current_product public.managed_products%rowtype;
begin
  select p.* into draft from public.admin_assistant_proposals p
  where p.id = p_id and p.actor_id = p_actor for update;
  if not found then return query select 'missing'::text, null::uuid; return; end if;
  if draft.applied_at is not null then return query select 'applied'::text, draft.product_id; return; end if;
  if draft.expires_at <= clock_timestamp() then return query select 'expired'::text, draft.product_id; return; end if;

  select m.* into current_product from public.managed_products m where m.id = draft.product_id for update;
  if not found or current_product.deleted_at is not null
    or current_product.updated_at is distinct from draft.product_version
    or current_product.category is distinct from draft.category
    or current_product.product_slug is distinct from draft.product_slug
    or not (to_jsonb(current_product) @> draft.before_values)
    or (not current_product.active and current_product.provider = 'vipayment' and draft.patch->'active' = 'true'::jsonb)
  then
    return query select 'conflict'::text, draft.product_id;
    return;
  end if;

  update public.managed_products m set
    name = coalesce(draft.patch->>'name', m.name),
    price = coalesce((draft.patch->>'price')::bigint, m.price),
    description = coalesce(draft.patch->>'description', m.description),
    active = coalesce((draft.patch->>'active')::boolean, m.active),
    updated_at = clock_timestamp()
  where m.id = draft.product_id;
  update public.admin_assistant_proposals p set applied_at = clock_timestamp() where p.id = draft.id;
  insert into public.admin_audit_log(actor_id, action, target)
    values (p_actor, 'assistant.product.applied', draft.product_id::text || '/' || draft.id::text);
  return query select 'applied'::text, draft.product_id;
end;
$$;

revoke all on function public.apply_admin_assistant_proposal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_admin_assistant_proposal(uuid, uuid) to service_role;
commit;
