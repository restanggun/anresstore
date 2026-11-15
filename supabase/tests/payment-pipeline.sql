begin;
do $$
declare r jsonb; duplicate jsonb; pid uuid := '11111111-1111-4111-8111-111111111111';
  p jsonb := jsonb_build_object('id',pid,'payment_mode','live','access_hash',repeat('a',64),'request_hash',repeat('b',64),
    'source','game','provider_code','managed.test','provider_service_code','SKU1','product_name','Test',
    'target','0012345678','target_zone','01234','amount',10000,'method','BRIVA','guest_session_hash',repeat('c',64),'checkout_hash',repeat('d',64),
    'fulfillment_mode','vipayment','provider_cost',8000,'service_quantity',1,'customer_name','Test','customer_email','test@example.com','customer_phone','08123456789');
begin
  r := public.reserve_payment(p);
  if not (r->>'claimed')::boolean then raise exception 'First reservation not claimed'; end if;
  duplicate := public.reserve_payment(p);
  if (duplicate->>'claimed')::boolean then raise exception 'Duplicate reservation claimed'; end if;
  duplicate := public.reserve_payment(p || jsonb_build_object('id','22222222-2222-4222-8222-222222222222'));
  if duplicate->'payment'->>'id' <> pid::text then raise exception 'Duplicate checkout not collapsed'; end if;
  if (select payment_mode from public.live_transactions where id=pid) <> 'live' then raise exception 'Mode projection failed'; end if;
  if (select target from public.live_transactions where id=pid)<>'0012345678' or (select target_zone from public.live_transactions where id=pid)<>'01234' then raise exception 'Player ID / zone changed during projection'; end if;
  if (select customer_email from public.live_transactions where id=pid) <> 'test@example.com' then raise exception 'Contact projection failed'; end if;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Unpaid order dispatched'; end if;
  update public.payments set status='paid',reference='LIVE-TEST',revision=revision+1 where id=pid;
  if (select count(*) from public.claim_live_fulfillment(pid)) <> 1 then raise exception 'Paid live order not claimed'; end if;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Duplicate dispatch'; end if;
  begin
    update public.payments set payment_mode='sandbox' where id=pid;
    raise exception 'Mutable mode accepted';
  exception when check_violation then null; end;
  begin
    perform public.reserve_payment(p || jsonb_build_object('payment_mode','invalid'));
    raise exception 'Nonproduction reservation accepted';
  exception when check_violation then null; end;
  perform public.reserve_payment(p || jsonb_build_object('id','44444444-4444-4444-8444-444444444444','checkout_hash',repeat('e',64),'fulfillment_mode','manual','provider_cost',null));
  update public.payments set status='paid',reference='MANUAL-TEST',revision=revision+1 where id='44444444-4444-4444-8444-444444444444';
  if exists(select 1 from public.claim_live_fulfillment('44444444-4444-4444-8444-444444444444')) then raise exception 'Manual service dispatched'; end if;
  r := public.reserve_payment(p || jsonb_build_object('id','55555555-5555-4555-8555-555555555555','payment_mode','sandbox'));
  if not (r->>'claimed')::boolean then raise exception 'Sandbox reservation not claimed'; end if;
  if (select payment_mode from public.live_transactions where id='55555555-5555-4555-8555-555555555555') <> 'sandbox' then raise exception 'Sandbox projected as live'; end if;
  update public.payments set status='paid',reference='SANDBOX-TEST',revision=revision+1 where id='55555555-5555-4555-8555-555555555555';
  if exists(select 1 from public.claim_live_fulfillment('55555555-5555-4555-8555-555555555555')) then raise exception 'Sandbox dispatched to real supplier'; end if;
  if (select count(*) from public.claim_sandbox_fulfillment('55555555-5555-4555-8555-555555555555')) <> 1 then raise exception 'Explicit sandbox fulfillment not claimed'; end if;
  if exists(select 1 from public.claim_sandbox_fulfillment('55555555-5555-4555-8555-555555555555')) then raise exception 'Sandbox dispatched twice'; end if;
  if not exists(select 1 from public.fulfillment_spend_reservations where order_id='55555555-5555-4555-8555-555555555555') then raise exception 'Sandbox bypassed spending limits'; end if;
  if has_function_privilege('authenticated','public.claim_sandbox_fulfillment(uuid)','execute') then raise exception 'Sandbox claim exposed'; end if;
  if to_regclass('public.orders') is not null then raise exception 'Retired order store remains'; end if;
  if has_table_privilege('anon','public.payments','select') or has_table_privilege('authenticated','public.live_transactions','select') then raise exception 'Private payments exposed'; end if;
  if has_function_privilege('authenticated','public.reserve_payment(jsonb)','execute') then raise exception 'Reservation RPC exposed'; end if;
end; $$;
rollback;
