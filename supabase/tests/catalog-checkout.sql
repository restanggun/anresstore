begin;
do $$
declare version_before bigint; result jsonb;
  variant_id uuid := '9b35fd82-28b4-4d56-98d7-c31b7db2e001';
  payment_id uuid := '9b35fd82-28b4-4d56-98d7-c31b7db2e002';
  payload jsonb;
begin
  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active,fulfillment_mode)
    values(variant_id,'manual','AUDIT-SKU','tasks','Audit','audit','Original',10000,true,'manual');
  select version into version_before from public.catalog_versions where category='tasks';
  payload := jsonb_build_object('id',payment_id,'payment_mode','live','access_hash',repeat('1',64),'request_hash',repeat('2',64),
    'source','tasks','provider_code','managed.'||variant_id,'provider_service_code','AUDIT-SKU','product_name','Audit - Original',
    'target','Assignment','amount',10000,'method','BRIVA','guest_session_hash',repeat('3',64),'checkout_hash',repeat('4',64),
    'fulfillment_mode','manual','service_quantity',1,'customer_name','Audit','customer_email','audit@example.com','customer_phone','08123456789',
    'catalog_revision',version_before::text);
  update public.managed_products set price=15000 where id=variant_id;
  begin
    perform public.reserve_payment(payload);
    raise exception 'Stale catalog accepted';
  exception when sqlstate 'PT409' then null; end;
  if exists(select 1 from public.payments where id=payment_id) then raise exception 'Stale checkout wrote an invoice'; end if;
  select version into version_before from public.catalog_versions where category='tasks';
  payload := payload || jsonb_build_object('catalog_revision',version_before::text,'amount',15000);
  result := public.reserve_payment(payload);
  if not (result->>'claimed')::boolean then raise exception 'Fresh checkout rejected'; end if;
  update public.managed_products set price=25000,active=false,deleted_at=now() where id=variant_id;
  if (select amount from public.payments where id=payment_id) <> 15000 then raise exception 'Existing invoice amount changed'; end if;
  if (select product_name from public.live_transactions where id=payment_id) <> 'Audit - Original' then raise exception 'Existing fulfillment changed'; end if;
  if has_table_privilege('authenticated','public.catalog_versions','update') then raise exception 'Public revision write permitted'; end if;
end; $$;
rollback;
