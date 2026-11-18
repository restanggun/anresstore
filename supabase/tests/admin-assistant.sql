begin;

insert into public.managed_products(id, provider, provider_code, category, product, product_slug, name, price, active)
values ('10dc1ec1-0e6d-4731-9348-a07931f5c611', 'manual', 'assistant-test', 'game', 'Test game', 'test-game', 'Test variant', 25000, true);

insert into public.admin_assistant_proposals(id, actor_id, product_id, category, product_slug, product_version, before_values, patch, expires_at)
select ids.id, '72f106f2-b4e9-4a04-897d-2d4f3fc38233', m.id, m.category, m.product_slug, m.updated_at,
       '{"price":25000}', '{"price":27000}', ids.expires_at
from public.managed_products m
cross join (values
  ('4c0659fd-fb6d-471f-b140-54194cec2fdf'::uuid, now() + interval '10 minutes'),
  ('4c0659fd-fb6d-471f-b140-54194cec2fe0'::uuid, now() + interval '10 minutes'),
  ('4c0659fd-fb6d-471f-b140-54194cec2fe1'::uuid, now() - interval '1 minute')
) ids(id, expires_at)
where m.id = '10dc1ec1-0e6d-4731-9348-a07931f5c611';

do $$
begin
  if has_function_privilege('authenticated', 'public.apply_admin_assistant_proposal(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.apply_admin_assistant_proposal(uuid,uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.admin_assistant_proposals', 'SELECT,INSERT,UPDATE,DELETE')
  then raise exception 'assistant drafts are exposed outside the service role'; end if;
end;
$$;

set local role service_role;
do $$
declare
  actor constant uuid := '72f106f2-b4e9-4a04-897d-2d4f3fc38233';
  first_draft constant uuid := '4c0659fd-fb6d-471f-b140-54194cec2fdf';
  variant constant uuid := '10dc1ec1-0e6d-4731-9348-a07931f5c611';
begin
  if (select result from public.apply_admin_assistant_proposal(first_draft, '72f106f2-b4e9-4a04-897d-2d4f3fc38234')) <> 'missing'
  then raise exception 'an admin applied another admin draft'; end if;
  if (select result from public.apply_admin_assistant_proposal('4c0659fd-fb6d-471f-b140-54194cec2fe1', actor)) <> 'expired'
  then raise exception 'an expired draft was accepted'; end if;
  if (select price from public.managed_products where id = variant) <> 25000
  then raise exception 'price changed before approval'; end if;
  if (select result from public.apply_admin_assistant_proposal(first_draft, actor)) <> 'applied'
  then raise exception 'draft was rejected'; end if;
  if (select price from public.managed_products where id = variant) <> 27000
  then raise exception 'approved price was not applied'; end if;
  if (select result from public.apply_admin_assistant_proposal('4c0659fd-fb6d-471f-b140-54194cec2fe0', actor)) <> 'conflict'
  then raise exception 'stale second draft overwrote the first'; end if;
  if (select result from public.apply_admin_assistant_proposal(first_draft, actor)) <> 'applied'
  then raise exception 'approved draft could not be replayed'; end if;
  if (select count(*) from public.admin_audit_log where actor_id = actor and action = 'assistant.product.applied') <> 1
  then raise exception 'draft replay did not preserve a single audit record'; end if;
end;
$$;
reset role;
rollback;
