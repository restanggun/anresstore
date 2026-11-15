-- Runs only in the local migration test database, before the production cutover.
do $$
declare mode text;
begin
  foreach mode in array array['live','sandbox'] loop
    perform public.reserve_payment(jsonb_build_object(
      'id',case when mode='live' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
      'payment_mode',mode,'access_hash',repeat('a',64),'request_hash',repeat('b',64),
      'source','game','provider_code','MIGRATION-TEST','provider_service_code','SKU1','product_name','Migration test',
      'target','123','amount',10000,'method','BRIVA','guest_session_hash',repeat('c',64),
      'checkout_hash',repeat('d',64),'fulfillment_mode','vipayment','provider_cost',8000,'service_quantity',1));
  end loop;
end; $$;
