begin;
do $$
declare pid uuid; p jsonb; i integer;
begin
  for i in 1..3 loop
    pid := ('55555555-5555-4555-8555-' || lpad(i::text,12,'0'))::uuid;
    p := jsonb_build_object('id',pid,'payment_mode','live','access_hash',repeat('a',64),'request_hash',repeat('b',64),
      'source','game','provider_code','SKU1','provider_service_code','SKU1','product_name','Test','target',i::text,
      'amount',10000,'method','BRIVA','guest_session_hash',repeat('c',64),'checkout_hash',lpad(i::text,64,'0'),
      'fulfillment_mode','vipayment','provider_cost',8000,'service_quantity',1,
      'customer_name','Test','customer_email','test@example.com','customer_phone','08123456789');
    perform public.reserve_payment(p);
    update public.payments set status='paid',reference='LIMIT-'||i,revision=revision+1 where id=pid;
  end loop;
  pid := '55555555-5555-4555-8555-000000000001';
  update public.fulfillment_limits set paused=true;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Paused claim allowed'; end if;
  update public.fulfillment_limits set paused=false,max_order_cost=7000;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Order limit ignored'; end if;
  if not (select review_required from public.live_transactions where id=pid) then raise exception 'Limit did not hold order'; end if;
  update public.fulfillment_limits set max_order_cost=10000,max_hour_cost=10000,max_day_cost=10000,max_hour_orders=1;
  update public.live_transactions set review_required=false where id=pid;
  if (select count(*) from public.claim_live_fulfillment(pid))<>1 then raise exception 'Allowed claim rejected'; end if;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Duplicate claim'; end if;
  if (select count(*) from public.fulfillment_spend_reservations)<>1 then raise exception 'Reservation not exactly once'; end if;
  pid := '55555555-5555-4555-8555-000000000002';
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Aggregate limit ignored'; end if;
  update public.fulfillment_limits set max_hour_cost=100000,max_hour_orders=100;
  update public.live_transactions set review_required=false where id=pid;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Daily limit ignored'; end if;
  update public.fulfillment_limits set max_day_cost=100000,max_hour_orders=1;
  update public.live_transactions set review_required=false where id=pid;
  if exists(select 1 from public.claim_live_fulfillment(pid)) then raise exception 'Hourly count ignored'; end if;
  if has_table_privilege('authenticated','public.fulfillment_limits','update')
    or has_table_privilege('anon','public.fulfillment_spend_reservations','select') then raise exception 'Limits exposed'; end if;
end; $$;
rollback;
