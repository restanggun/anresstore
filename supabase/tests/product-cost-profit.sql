begin;
do $$
declare vid uuid := '8d04d63f-6302-4321-8d31-c8e683eae111';
  pid uuid := '8d04d63f-6302-4321-8d31-c8e683eae112';
  payload jsonb;
  report record;
  initial_unknown_cost_count integer;
begin
  select (summary->>'unknownCostCount')::integer into initial_unknown_cost_count from public.admin_transaction_analytics(7);
  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,cost_price,active,fulfillment_mode)
  values(vid,'manual','COST-SKU','tasks','Cost','cost','Custom',15000,6000,true,'manual');
  payload := jsonb_build_object('id',pid,'payment_mode','live','access_hash',repeat('1',64),'request_hash',repeat('2',64),
    'source','tasks','provider_code','managed.'||vid,'provider_service_code','COST-SKU','product_name','Cost - Custom',
    'target','Assignment','amount',15000,'method','BRIVA','guest_session_hash',repeat('3',64),'checkout_hash',repeat('4',64),
    'fulfillment_mode','manual','service_quantity',1,'customer_name','Test','customer_email','test@example.com','customer_phone','08123456789');
  perform public.reserve_payment(payload);
  if (select cost_price from public.payments where id=pid) <> 6000 then raise exception 'Custom cost snapshot missing'; end if;
  update public.managed_products set cost_price=9000 where id=vid;
  if (select cost_price from public.payments where id=pid) <> 6000 then raise exception 'Historical cost changed'; end if;
  update public.payments set status='paid',reference='COST-TEST',revision=revision+1 where id=pid;
  select * into report from public.admin_transaction_analytics(7);
  if (report.summary->>'costAmount')::bigint <> 6000 then raise exception 'Cost missing from analytics'; end if;
  if (report.summary->>'profitAmount')::bigint <> 9000 then raise exception 'Profit missing from analytics'; end if;
  if (report.summary->>'unknownCostCount')::integer <> initial_unknown_cost_count then raise exception 'Cost coverage is incorrect'; end if;
  if (report.summary->>'profitAmount')::numeric / ((report.summary->>'costAmount')::numeric + (report.summary->>'profitAmount')::numeric) <> 0.6 then raise exception 'Recorded margin is incorrect'; end if;
end; $$;

do $$
declare
  variant_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  imported_id bigint;
  baseline jsonb;
  report jsonb;
begin
  select summary into baseline from public.admin_transaction_analytics(7);
  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,cost_price,active,fulfillment_mode)
  values(variant_id,'manual','REPORT-PREMIUM-COST','apps','Cost fixture','cost-fixture','Sharing 1 Bulan',20000,6000,true,'manual');

  insert into public.premium_orders(id,guest_session_hash,customer_email,product_id,product_name,
    access_type,duration_days,guarantee_days,guarantee_terms,amount,status,paid_at)
  values(order_id,repeat('7',64),'test@example.com',variant_id,'Cost fixture - Sharing 1 Bulan',
    'sharing',30,7,'Example guarantee',20000,'delivered',now());
  update public.managed_products set cost_price=7000 where id=variant_id;
  if (select accounting_cost from public.admin_transaction_records where id=order_id::text) is distinct from 6000::bigint then
    raise exception 'Premium order cost did not preserve the checkout snapshot';
  end if;

  insert into public.historical_sales(import_key,sale_date,payment_method,amount,product_name,variant_description,quantity)
  values('report-cost-match',(now() at time zone 'Asia/Jakarta')::date,'qris',35000,'cost fixture','SHARING · 1 BULAN',2)
  returning id into imported_id;
  select summary into report from public.admin_transaction_analytics(7);
  if (report->>'costAmount')::bigint - (baseline->>'costAmount')::bigint <> 20000
    or (report->>'profitAmount')::bigint - (baseline->>'profitAmount')::bigint <> 35000 then
    raise exception 'Report did not include premium and matched QRIS costs and profit';
  end if;

  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,cost_price,active,fulfillment_mode)
  values(gen_random_uuid(),'manual','REPORT-AMBIGUOUS-COST','apps','Cost fixture','cost-fixture','Sharing 1 Bulan',25000,22000,true,'manual');
  if (select accounting_cost from public.admin_transaction_records where id='historical-'||imported_id) is not null then
    raise exception 'An ambiguous QRIS variant received a cost';
  end if;
  if has_table_privilege('authenticated','public.premium_order_costs','select') then
    raise exception 'Premium order cost was exposed';
  end if;
end; $$;
rollback;
