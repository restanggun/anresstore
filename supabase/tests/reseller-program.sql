begin;
do $$
declare
  seller uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  activation uuid := gen_random_uuid();
  second_activation uuid := gen_random_uuid();
  hosted_payment uuid := gen_random_uuid();
  link uuid := gen_random_uuid();
  template uuid := gen_random_uuid();
  result jsonb;
  payload jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (seller,'reseller-test@example.com',now()),(buyer,'reseller-buyer-test@example.com',now());
  begin
    perform public.submit_reseller(seller,'Test Store','08123456789');
    raise exception 'Closed enrollment accepted';
  exception when sqlstate 'PT409' then null; end;
  update public.reseller_settings set registration_open=true,hosted_commission_percent=50;
  perform public.submit_reseller(seller,'Test Store','08123456789');
  perform public.submit_reseller(seller,'Test Store','08123456789');
  insert into public.reseller_prices values
    ('game','SELLER-SKU',100000,98000,96000),
    ('game','ACTIVATION-40',40000,39000,38000),
    ('game','ACTIVATION-60',60000,59000,58000);

  payload := jsonb_build_object('id',activation,'payment_mode','live','access_hash',repeat('a',64),'request_hash',repeat('b',64),
    'source','game','provider_code','ACTIVATION-40','provider_service_code','ACTIVATION-40','product_name','Reseller test',
    'target','0012345678','amount',40000,'method','BRIVA','owner_user_id',seller,'checkout_hash',repeat('d',64),
    'fulfillment_mode','vipayment','provider_cost',30000,'service_quantity',1,
    'customer_name','Test Store','customer_email','reseller-test@example.com','customer_phone','08123456789');
  begin
    perform public.reserve_reseller_payment(payload,'dashboard');
    raise exception 'Unapproved reseller reserved invoice';
  exception when sqlstate 'PT409' then null; end;
  update public.resellers set status='approved' where user_id=seller;
  begin
    perform public.reserve_reseller_payment(payload || jsonb_build_object('amount',39999),'dashboard');
    raise exception 'Tampered activation price accepted';
  exception when sqlstate 'PT409' then null; end;
  result := public.reserve_reseller_payment(payload,'dashboard');
  if not (result->>'claimed')::boolean then raise exception 'Activation was not reserved'; end if;
  result := public.reserve_reseller_payment(payload,'dashboard');
  if (result->>'claimed')::boolean then raise exception 'Retry claimed a second activation'; end if;
  if (public.reseller_progress(seller)->>'activated')::boolean then raise exception 'Unpaid activation granted access'; end if;
  update public.payments set status='paid',reference='RESELLER-TEST',revision=revision+1 where id=activation;
  update public.live_transactions set fulfillment_status='completed' where id=activation;
  result := public.reseller_progress(seller);
  if (result->>'activated')::boolean or (result->>'activationSpend')::int<>40000
    then raise exception 'Partial activation spend incorrect: %',result; end if;
  payload := payload || jsonb_build_object('id',second_activation,'provider_code','ACTIVATION-60',
    'provider_service_code','ACTIVATION-60','amount',60000,'provider_cost',50000,'checkout_hash',repeat('2',64));
  perform public.reserve_reseller_payment(payload,'dashboard');
  update public.payments set status='paid',reference='RESELLER-TEST-SECOND',revision=revision+1 where id=second_activation;
  update public.live_transactions set fulfillment_status='completed' where id=second_activation;
  result := public.reseller_progress(seller);
  if not (result->>'activated')::boolean or (result->>'retailSpend')::int<>0
    or (result->>'volume')::int<>100000 or (result->>'activationSpend')::int<>100000
    then raise exception 'Wholesale progress incorrect: %',result; end if;
  begin
    perform public.reserve_reseller_payment(payload || jsonb_build_object('id',gen_random_uuid(),'checkout_hash',repeat('e',64)),'api',repeat('f',64));
    raise exception 'Missing API key accepted';
  exception when sqlstate 'PT409' then null; end;

  insert into public.reseller_checkout_links(id,reseller_id,category,code) values(link,seller,'game','SELLER-SKU');
  payload := payload || jsonb_build_object('id',hosted_payment,'amount',300000,'provider_code','SELLER-SKU',
    'provider_service_code','SELLER-SKU','provider_cost',80000,'checkout_hash',repeat('1',64));
  begin
    perform public.reserve_hosted_reseller_payment(payload,link,50,100000);
    raise exception 'Self-purchase accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.reserve_hosted_reseller_payment(payload - 'owner_user_id' || jsonb_build_object('guest_session_hash',repeat('e',64)),link,50,100000);
    raise exception 'Anonymous purchase with seller billing email accepted';
  exception when sqlstate 'PT409' then null; end;
  payload := payload || jsonb_build_object('owner_user_id',buyer,'customer_email','reseller-buyer-test@example.com');
  perform public.reserve_hosted_reseller_payment(payload,link,50,100000);
  begin
    perform public.reserve_hosted_reseller_payment(payload || jsonb_build_object('id',gen_random_uuid()),link,50,100000);
    raise exception 'Link reused for a second order';
  exception when sqlstate 'PT409' then null; end;
  update public.payments set status='paid',reference='RESELLER-HOSTED-TEST',revision=revision+1 where id=hosted_payment;
  update public.live_transactions set fulfillment_status='completed' where id=hosted_payment;
  if (select state from public.reseller_checkout_status where id=link)<>'holding' then raise exception 'Commission bypassed hold'; end if;
  if public.reseller_progress(buyer)->>'retailTier'<>'perak' or exists(select 1 from public.resellers where user_id=buyer)
    then raise exception 'Retail tier registered buyer as reseller or was not credited'; end if;
  insert into public.vouchers(id,name,kind,value,starts_at,ends_at,total_limit,account_limit,active)
    values(template,'Test Perak','fixed',1000,now()-interval '1 day',now()+interval '1 day',5,1,true);
  update public.reseller_settings set perak_voucher_id=template;
  perform public.claim_retail_tier(buyer,'perak');
  perform public.claim_retail_tier(buyer,'perak');
  if (select count(*) from public.voucher_accounts a join public.retail_tier_claims c on c.voucher_id=a.voucher_id
      where a.user_id=buyer and c.user_id=buyer and c.tier='perak' and a.voucher_id<>template)<>1
    then raise exception 'Tier voucher claim was not idempotent'; end if;
  update public.reseller_checkout_links set completed_at=now()-interval '15 days' where id=link;
  perform public.record_reseller_payout(link,100000,'RES-TEST-PAYOUT');
  perform public.record_reseller_payout(link,100000,'RES-TEST-PAYOUT');
  update public.payments set status='refunded',revision=revision+1 where id=hosted_payment;
  if (select state from public.reseller_checkout_status where id=link)<>'adjustment'
    or public.reseller_progress(buyer)->>'retailTier'<>'reguler' then raise exception 'Refund did not unwind progress and flag payout'; end if;
  perform public.record_reseller_adjustment(link,100000,'RES-TEST-ADJUST');
  perform public.record_reseller_adjustment(link,100000,'RES-TEST-ADJUST');
  if (select state from public.reseller_checkout_status where id=link)<>'reconciled' then raise exception 'Adjustment was not reconciled'; end if;
  update public.payments set status='refunded',revision=revision+1 where id=activation;
  result := public.reseller_progress(seller);
  if (result->>'activated')::boolean or (result->>'activationSpend')::int<>60000
    then raise exception 'Refund did not remove activation spend: %',result; end if;
  if has_table_privilege('authenticated','public.reseller_keys','select')
    or has_table_privilege('anon','public.reseller_checkout_status','select')
    or has_function_privilege('authenticated','public.reserve_reseller_payment(jsonb,text,text)','execute')
    then raise exception 'Private reseller data or RPC exposed'; end if;
end
$$;
rollback;
