begin;
do $$
declare
  buyer uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  campaign uuid := gen_random_uuid();
  gift uuid := gen_random_uuid();
  premium_campaign uuid := gen_random_uuid();
  variant uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid();
  followup uuid := gen_random_uuid();
  gift_order uuid := gen_random_uuid();
  premium_order uuid := gen_random_uuid();
  premium_gift_order uuid := gen_random_uuid();
  rule_date timestamptz;
  app_version bigint;
  offer jsonb;
  result jsonb;
  args jsonb;
  context jsonb;
  referral uuid;
  reward_targets jsonb := '[
    {"category":"game","product_slug":"mobile-legends","variant_code":"sku-1"},
    {"category":"game","product_slug":"mobile-legends","variant_code":"sku-2"},
    {"category":"game","product_slug":"free-fire","variant_code":null},
    {"category":"apps","product_slug":"test-app","variant_code":null}
  ]';
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (buyer,'voucher-buyer@example.test',now()),(stranger,'voucher-stranger@example.test',now());
  insert into public.vouchers(id,name,code,kind,value,discount_cap,category,product_slug,variant_code,starts_at,ends_at,total_limit,active)
    values(campaign,'Diskon game','ANRES-TEST-PERCENT','percent',25,1200,'game','mobile-legends','sku-1',
      now()-interval '1 hour',now()+interval '1 hour',1,true);

  context := jsonb_build_object('user_id',buyer,'source','game','product_slug','mobile-legends','code','sku-1',
    'base_amount',10000,'mode','live','promoted',false);
  offer := public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context);
  if offer->>'amount' <> '8800' then raise exception 'Percent cap not applied'; end if;
  update public.vouchers set starts_at=now()-interval '2 hour',ends_at=now()-interval '1 hour' where id=campaign;
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context);
    raise exception 'Expired campaign accepted';
  exception when sqlstate 'PT409' then null; end;
  update public.vouchers set starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hour' where id=campaign;
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context);
    raise exception 'Scheduled campaign accepted before start';
  exception when sqlstate 'PT409' then null; end;
  update public.vouchers set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=campaign;
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context||'{"code":"sku-2"}');
    raise exception 'Wrong variant accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context||'{"promoted":true}');
    raise exception 'Promo stacking accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-PERCENT"}',context||'{"mode":"sandbox"}');
    raise exception 'Sandbox stock access accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.voucher_offer(jsonb_build_object('id',campaign),context);
    raise exception 'Ungranted account accepted';
  exception when sqlstate 'PT409' then null; end;

  perform public.voucher_set_account(campaign,'voucher-buyer@example.test',true,stranger);
  if not exists(select 1 from public.account_vouchers(buyer) where id=campaign) or
    exists(select 1 from public.account_vouchers(stranger) where id=campaign) then raise exception 'Voucher wallet leaked'; end if;
  perform public.voucher_set_account(campaign,'voucher-buyer@example.test',false,stranger);
  begin
    perform public.voucher_offer(jsonb_build_object('id',campaign),context);
    raise exception 'Revoked account voucher still accepted';
  exception when sqlstate 'PT409' then null; end;
  perform public.voucher_set_account(campaign,'voucher-buyer@example.test',true,stranger);
  update public.vouchers set category=null,product_slug=null,variant_code=null,targets=reward_targets where id=campaign;
  foreach offer in array array[
    context, context||'{"code":"sku-2"}', context||'{"product_slug":"free-fire","code":"different-sku"}',
    context||'{"source":"apps","product_slug":"test-app","code":"app-sku"}'
  ] loop
    if public.voucher_offer(jsonb_build_object('id',campaign),offer)->>'amount' is distinct from '8800' then
      raise exception 'Selected target did not receive discount';
    end if;
  end loop;
  foreach offer in array array[
    context||'{"code":"sku-3"}', context||'{"product_slug":"other-game"}',
    context||'{"source":"prepaid","product_slug":"free-fire"}',
    context||'{"product_slug":null}'
  ] loop
    begin
      perform public.voucher_offer(jsonb_build_object('id',campaign),offer);
      raise exception 'Unselected target received discount';
    exception when sqlstate 'PT409' then null; end;
  end loop;

  args := jsonb_build_object('id',payment_id,'payment_mode','live','source','game','provider_code','sku-1',
    'invoice_product_code','mobile-legends','product_name','Game variant','target','123','amount',8800,
    'method','QRIS','owner_user_id',buyer,'checkout_hash',repeat('a',64),'request_hash',repeat('b',64),
    'access_hash',repeat('c',64),'fulfillment_mode','manual');
  begin
    perform public.reserve_voucher_payment(jsonb_build_object('id',campaign),args||'{"amount":1}',null,10000,false);
    raise exception 'Tampered checkout total accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.reserve_voucher_payment(jsonb_build_object('id',campaign),args||'{"provider_code":"sku-3"}',null,10000,false);
    raise exception 'Unselected variant consumed quota at checkout';
  exception when sqlstate 'PT409' then null; end;
  result := public.reserve_voucher_payment(jsonb_build_object('id',campaign),args,null,10000,false);
  if result->'payment'->>'amount'<>'8800' or (select state from public.voucher_usage where voucher_id=campaign limit 1)<>'reserved' then
    raise exception 'Payment or reservation not recorded';
  end if;
  result := public.reserve_voucher_payment(jsonb_build_object('id',campaign),args,null,10000,false);
  if (result->>'claimed')::boolean then raise exception 'Retry claimed twice'; end if;
  begin
    perform public.reserve_voucher_payment(jsonb_build_object('id',campaign),
      args||jsonb_build_object('id',followup,'checkout_hash',repeat('d',64),'provider_code','sku-2'),null,10000,false);
    raise exception 'Campaign quota overspent across variants';
  exception when sqlstate 'PT409' then null; end;
  update public.payments set status='unknown',revision=revision+1 where id=payment_id;
  if (public.voucher_admin_usage(campaign)->>'reserved')::integer<>1 then raise exception 'Uncertain payment released quota'; end if;
  update public.payments set status='expired',revision=revision+1 where id=payment_id;
  if (public.voucher_admin_usage(campaign)->>'released')::integer<>1 then raise exception 'Expired voucher hold not released'; end if;
  result := public.reserve_voucher_payment(jsonb_build_object('id',campaign),
    args||jsonb_build_object('id',followup,'checkout_hash',repeat('d',64)),null,10000,false);
  update public.payments set status='paid',revision=revision+1 where id=followup;
  update public.payments set status='refunded',revision=revision+1 where id=followup;
  if (public.voucher_admin_usage(campaign)->>'used')::integer<>1 then raise exception 'Refund replenished used voucher'; end if;
  perform public.voucher_set_account(campaign,'voucher-buyer@example.test',false,stranger);
  if exists(select 1 from public.account_vouchers(buyer) where id=campaign) then raise exception 'Revoked voucher visible'; end if;

  insert into public.vouchers(id,name,code,kind,value,discount_cap,category,product_slug,variant_code,starts_at,ends_at,total_limit,account_limit,active)
    values(gift,'Hadiah','ANRES-TEST-GIFT','gift',1,10000,'game','mobile-legends','sku-1',
      now()-interval '1 hour',now()+interval '1 hour',2,1,true);
  args := args||jsonb_build_object('id',gift_order,'checkout_hash',repeat('e',64),'method','VOUCHER','amount',0);
  begin
    perform public.voucher_offer('{"code":"ANRES-TEST-GIFT"}',context||'{"user_id":null}');
    raise exception 'Guest redeemed gift';
  exception when sqlstate 'PT409' then null; end;
  result := public.reserve_voucher_payment('{"code":"ANRES-TEST-GIFT"}',args,null,10000,false);
  if result->'payment'->>'status'<>'paid' or not exists(
    select 1 from public.live_transactions where id=gift_order and amount=0 and fulfillment_status='ready'
  ) then raise exception 'Gift did not enter fulfillment'; end if;
  begin
    perform public.reserve_voucher_payment('{"code":"ANRES-TEST-GIFT"}',
      args||jsonb_build_object('id',gen_random_uuid(),'checkout_hash',repeat('f',64)),null,10000,false);
    raise exception 'Gift account limit bypassed';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.reserve_payment(args||jsonb_build_object('id',gen_random_uuid(),'checkout_hash',repeat('f',64)));
    set constraints verify_payment_voucher immediate;
    raise exception 'Unbacked zero payment accepted';
  exception when check_violation then null; end;

  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active,fulfillment_mode)
    values(variant,'manual','APP-VOUCHER-SKU','apps','App','test-app','One Month',10000,true,'manual');
  insert into public.premium_product_rules(product_id,access_type,duration_days,guarantee_days,guarantee_terms)
    values(variant,'private',30,15,'Test guarantee scope') returning updated_at into rule_date;
  select version into app_version from public.catalog_versions where category='apps';
  insert into public.vouchers(id,name,code,kind,value,category,starts_at,ends_at,total_limit,active)
    values(premium_campaign,'Premium','ANRES-TEST-APP','fixed',2500,'apps',
      now()-interval '1 hour',now()+interval '1 hour',2,true);
  select to_jsonb(order_row) into result from public.reserve_premium_voucher('{"code":"ANRES-TEST-APP"}',
    premium_order,buyer,null,'voucher-buyer@example.test',null,variant,10000,7500,rule_date,app_version,false) order_row;
  if result->>'amount'<>'7500' or result->>'status'<>'awaiting_qr' then raise exception 'Premium voucher wrong amount'; end if;
  -- Disabling a campaign must not change the amount of an issued invoice.
  update public.vouchers set active=false where id=premium_campaign;
  select to_jsonb(order_row) into result from public.reserve_premium_voucher('{"code":"ANRES-TEST-APP"}',
    premium_order,buyer,null,'voucher-buyer@example.test',null,variant,10000,7500,rule_date,app_version,false) order_row;
  if result->>'amount'<>'7500' then raise exception 'Premium voucher retry mutated the invoice'; end if;
  update public.premium_orders set status='awaiting_payment',qr_expires_at=now()+interval '1 hour' where id=premium_order;
  begin
    perform public.voucher_release_premium(premium_campaign,premium_order,stranger);
    raise exception 'Unexpired QR was released';
  exception when sqlstate 'PT409' then null; end;
  update public.premium_orders set qr_expires_at=now()-interval '1 hour' where id=premium_order;
  perform public.voucher_release_premium(premium_campaign,premium_order,stranger);
  if (public.voucher_admin_usage(premium_campaign)->>'released')::integer<>1 then raise exception 'Premium cancellation did not release stock'; end if;
  update public.vouchers set code=null,kind='gift',value=1,discount_cap=10000,account_limit=1,active=true,category=null,
    targets=jsonb_build_array(
      jsonb_build_object('category','apps','product_slug','test-app','variant_code','managed.'||variant::text),
      jsonb_build_object('category','game','product_slug','mobile-legends','variant_code','sku-1')
    ) where id=premium_campaign;
  perform public.voucher_set_account(premium_campaign,'voucher-buyer@example.test',true,stranger);
  select to_jsonb(order_row) into result from public.reserve_premium_voucher(jsonb_build_object('id',premium_campaign),
    premium_gift_order,buyer,null,'voucher-buyer@example.test',null,variant,10000,0,rule_date,app_version,false) order_row;
  if result->>'amount'<>'0' or result->>'status'<>'paid' or result->>'voucher_gift'<>'true' then
    raise exception 'Premium gift required a QR payment';
  end if;
  update public.vouchers set code=null,account_limit=1 where id=campaign;
  update public.campaign_settings set enabled=true,config=config||jsonb_build_object(
    'referrerVoucherTemplate',campaign,'friendVoucherTemplate',campaign) where id=1;
  insert into public.referral_attributions(referrer_user_id,referred_user_id,referral_code,status)
    values(stranger,buyer,'AABBCCDDEEFF0011','qualified') returning id into referral;
  perform public.review_referral(referral,true,stranger);
  if (select count(*) from public.referral_attributions a join public.vouchers v
      on v.id in (a.referrer_voucher_id,a.friend_voucher_id)
      where a.id=referral and v.targets=reward_targets and v.total_limit=1)<>2 then
    raise exception 'Referral rewards lost voucher targets';
  end if;
  set constraints all immediate;
  if has_table_privilege('anon','public.vouchers','select') or
    has_table_privilege('authenticated','public.voucher_accounts','insert') or
    has_function_privilege('authenticated','public.reserve_voucher_payment(jsonb,jsonb,jsonb,integer,boolean)','execute') then
    raise exception 'Voucher data or reservations exposed to clients';
  end if;
end; $$;
rollback;
