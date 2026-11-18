begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.save_admin_assistant_registry(uuid,integer,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.stage_admin_assistant_batch(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_admin_assistant_batch(uuid,uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.admin_assistant_runs', 'SELECT,INSERT')
  then raise exception 'assistant registry is exposed outside service role'; end if;
end;
$$;

insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active) values
 ('842859d6-5ea3-4b50-9af6-95a2c861e500','manual','assistant-batch-a','game','Test','test-game','First',25000,true),
 ('842859d6-5ea3-4b50-9af6-95a2c861e501','manual','assistant-batch-b','game','Test','test-game','Second',26000,true);

set local role service_role;
do $$
declare
  actor constant uuid := '780beafd-2232-4f7a-a48c-164090d98a32';
  stale_batch constant uuid := 'ec521c2a-b27d-4604-a65b-fd80aafdc001';
  fresh_batch constant uuid := 'ec521c2a-b27d-4604-a65b-fd80aafdc002';
  first_variant constant uuid := '842859d6-5ea3-4b50-9af6-95a2c861e500';
  second_variant constant uuid := '842859d6-5ea3-4b50-9af6-95a2c861e501';
  items jsonb;
  outcome text;
begin
  if (select revision from public.save_admin_assistant_registry(actor,0,'{"skills":{}}')) is distinct from 1
  then raise exception 'registry version was not recorded'; end if;
  if exists(select 1 from public.save_admin_assistant_registry(actor,0,'{"skills":{"bad":true}}'))
  then raise exception 'registry allowed a stale overwrite'; end if;

  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'product_id',m.id,'category',m.category,
    'product_slug',m.product_slug,'product_version',m.updated_at,'before_price',m.price,'after_price',m.price+1000))
    into items from public.managed_products m where m.id in (first_variant,second_variant);
  perform * from public.stage_admin_assistant_batch(stale_batch,actor,items);
  update public.managed_products set price=26500, updated_at=clock_timestamp() where id=second_variant;
  select result into outcome from public.apply_admin_assistant_batch(stale_batch,actor);
  if outcome <> 'conflict' or (select price from public.managed_products where id=first_variant) <> 25000
  then raise exception 'batch did not roll back all updates on conflict'; end if;
  if exists(select 1 from public.admin_audit_log where actor_id=actor and action='assistant.product.applied')
  then raise exception 'failed batch left an applied audit'; end if;

  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'product_id',m.id,'category',m.category,
    'product_slug',m.product_slug,'product_version',m.updated_at,'before_price',m.price,'after_price',m.price+1000))
    into items from public.managed_products m where m.id in (first_variant,second_variant);
  perform * from public.stage_admin_assistant_batch(fresh_batch,actor,items);
  select result into outcome from public.apply_admin_assistant_batch(fresh_batch,actor);
  if outcome <> 'applied' or (select price from public.managed_products where id=first_variant) <> 26000
    or (select price from public.managed_products where id=second_variant) <> 27500
  then raise exception 'batch did not apply all items'; end if;
  perform * from public.apply_admin_assistant_batch(fresh_batch,actor);
  if (select count(*) from public.admin_audit_log where actor_id=actor and action='assistant.batch.applied') <> 1
  then raise exception 'batch replay produced multiple audits'; end if;
end;
$$;
reset role;
rollback;
