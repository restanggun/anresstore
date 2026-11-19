begin;
do $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  product_id uuid := '8d04d63f-6302-4321-8d31-c8e683eae221';
  checkout_id uuid := '8d04d63f-6302-4321-8d31-c8e683eae222';
  before_report record;
  report record;
  chart_day jsonb;
  baseline_day jsonb;
begin
  select * into before_report from public.admin_transaction_analytics(7);
  select entry into baseline_day from jsonb_array_elements(before_report.daily) entry where entry->>'date'=today::text;
  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,cost_price,active,fulfillment_mode)
  values(product_id,'manual','REPORT-SKU','tasks','Report fixture','report-fixture','Checkout variant',15000,6000,true,'manual');
  insert into public.task_price_rules(product_id,price_per_page,price_per_revision,rush_fee_per_day,standard_days,max_pages,max_revisions)
  values(product_id,0,0,0,2,10,2);
  perform public.reserve_payment(jsonb_build_object(
    'id',checkout_id,'payment_mode','live','access_hash',repeat('1',64),'request_hash',repeat('2',64),
    'source','tasks','provider_code','managed.'||product_id,'provider_service_code','REPORT-SKU',
    'product_name','Report fixture - Checkout variant','target','Assignment','amount',15000,'method','BRIVA',
    'guest_session_hash',repeat('3',64),'checkout_hash',repeat('4',64),
    'fulfillment_mode','manual','service_quantity',1,'customer_name','Test','customer_email','test@example.com','customer_phone','08123456789'));
  insert into public.task_order_specs(payment_id,product_id,instructions,pages,deadline_days,purchased_revisions,quoted_amount)
  values(checkout_id,product_id,'Example assignment',1,2,0,15000);
  insert into public.premium_orders(id,guest_session_hash,customer_email,product_id,product_name,access_type,duration_days,guarantee_days,guarantee_terms,amount,status,paid_at)
  values(gen_random_uuid(),repeat('5',64),'test@example.com',product_id,'Report fixture - Premium variant','private',30,7,'Example guarantee',22000,'delivered',now()),
    (gen_random_uuid(),repeat('5',64),'test@example.com',product_id,'Report fixture - Cancelled variant','private',30,7,'Example guarantee',30000,'cancelled',null);
  insert into public.historical_sales(import_key,sale_date,payment_method,amount,product_name,variant_description,quantity)
  values('report-recent',today-1,'qris',10000,'Report fixture','Historical variant',1),
    ('report-outside',today-7,'qris',25000,'Report fixture','Outside seven days',1);

  select * into report from public.admin_transaction_analytics(7);
  if (report.summary->>'orders')::int - (before_report.summary->>'orders')::int <> 4
    or (report.summary->>'paidCount')::int - (before_report.summary->>'paidCount')::int <> 2
    or (report.summary->>'pendingCount')::int - (before_report.summary->>'pendingCount')::int <> 1
    or (report.summary->>'failedCount')::int - (before_report.summary->>'failedCount')::int <> 1
    or (report.summary->>'paidAmount')::bigint - (before_report.summary->>'paidAmount')::bigint <> 32000
    or (report.summary->>'costAmount')::bigint - (before_report.summary->>'costAmount')::bigint <> 6000
    or (report.summary->>'profitAmount')::bigint - (before_report.summary->>'profitAmount')::bigint <> 16000
    or (report.summary->>'completed')::int - (before_report.summary->>'completed')::int <> 1 then
    raise exception 'Dashboard summary omitted or duplicated a transaction: %', report.summary;
  end if;
  if (select count(*) from public.admin_list_transactions('payments','all','report fixture',0)) <> 5
    or (select count(*) from public.admin_list_transactions('payments','pending','report fixture',0)) <> 1
    or (select count(*) from public.admin_list_transactions('fulfillment','all','report fixture',0)) <> 1 then
    raise exception 'Transaction lists and filters are inconsistent';
  end if;

  update public.payments set status='paid',reference='REPORT-TEST',revision=revision+1 where id=checkout_id;
  select * into report from public.admin_transaction_analytics(7);
  select entry into chart_day from jsonb_array_elements(report.daily) entry where entry->>'date'=today::text;
  if jsonb_array_length(report.daily) <> 7
    or (chart_day->>'orders')::int - (baseline_day->>'orders')::int <> 3
    or (chart_day->>'paidCount')::int - (baseline_day->>'paidCount')::int <> 2
    or (chart_day->>'paid')::bigint - (baseline_day->>'paid')::bigint <> 37000
    or (chart_day->>'cost')::bigint - (baseline_day->>'cost')::bigint <> 12000
    or (chart_day->>'profit')::bigint - (baseline_day->>'profit')::bigint <> 25000
    or not report.products @> '[{"name":"Report fixture","value":3,"amount":47000}]'::jsonb then
    raise exception 'Payment update did not reach chart or best sellers: %, %', chart_day, report.products;
  end if;

  update public.payments set status='refunded',revision=revision+1 where id=checkout_id;
  select * into report from public.admin_transaction_analytics(7);
  if (report.summary->>'refundedCount')::int - (before_report.summary->>'refundedCount')::int <> 1
    or (report.summary->>'paidCount')::int - (before_report.summary->>'paidCount')::int <> 2
    or (report.summary->>'paidAmount')::bigint - (before_report.summary->>'paidAmount')::bigint <> 32000
    or (report.summary->>'costAmount')::bigint - (before_report.summary->>'costAmount')::bigint <> 6000
    or (report.summary->>'profitAmount')::bigint - (before_report.summary->>'profitAmount')::bigint <> 16000
    or not report.products @> '[{"name":"Report fixture","value":2,"amount":32000}]'::jsonb then
    raise exception 'Refund did not update report counts or product ranking';
  end if;
  select * into report from public.admin_transaction_analytics(30);
  if not report.products @> '[{"name":"Report fixture","value":3,"amount":57000}]'::jsonb then
    raise exception 'Period change did not include older QRIS sale';
  end if;
  if has_table_privilege('authenticated','public.admin_transaction_records','SELECT')
    or has_function_privilege('authenticated','public.admin_list_transactions(text,text,text,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.admin_transaction_analytics(integer)','EXECUTE') then
    raise exception 'Admin reporting must stay service-role only';
  end if;
end; $$;
rollback;
