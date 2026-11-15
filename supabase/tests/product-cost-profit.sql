begin;
do $$
declare vid uuid := '8d04d63f-6302-4321-8d31-c8e683eae111';
  pid uuid := '8d04d63f-6302-4321-8d31-c8e683eae112';
  payload jsonb;
  report record;
begin
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
  if (report.summary->>'unknownCostCount')::integer <> 0 then raise exception 'Cost coverage is incorrect'; end if;
  if (report.summary->>'profitAmount')::numeric / ((report.summary->>'costAmount')::numeric + (report.summary->>'profitAmount')::numeric) <> 0.6 then raise exception 'Recorded margin is incorrect'; end if;
end; $$;
rollback;
