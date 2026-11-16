begin;
do $$
declare r jsonb; again jsonb; code text; other_code text;
  p jsonb := jsonb_build_object('id','77777777-7777-4777-8777-777777777777','payment_mode','live',
    'access_hash',repeat('a',64),'request_hash',repeat('b',64),'source','game','provider_code','ml5',
    'product_name','Mobile Legends - 5 Diamonds','target','123','amount',2100,'method','QRIS2',
    'guest_session_hash',repeat('c',64),'checkout_hash',repeat('d',64),'fulfillment_mode','vipayment',
    'provider_cost',1500,'invoice_product_code','mobile-legends','invoice_subproduct_code','ml-5');
begin
  r := public.reserve_payment(p); code := r->'payment'->>'invoice_number';
  if code !~ '^ANRS-[0-9]{6}-[A-F0-9]{14}$' then raise exception 'Invalid invoice format: %',code; end if;
  if length(code) <> 26 then raise exception 'Invoice not shortened'; end if;
  if split_part(code,'-',2) <> to_char(now() at time zone 'Asia/Jakarta','YYMMDD') then raise exception 'Wrong invoice date'; end if;
  if r->'payment'->>'merchant_ref' <> code then raise exception 'Gateway reference differs from invoice'; end if;
  if (select invoice_number from public.live_transactions where id=(p->>'id')::uuid) <> code then raise exception 'Admin projection differs'; end if;
  again := public.reserve_payment(p);
  if again->'payment'->>'invoice_number' <> code or (again->>'claimed')::boolean then raise exception 'Retry changed invoice'; end if;
  again := public.reserve_payment(p || '{"id":"88888888-8888-4888-8888-888888888888"}'::jsonb);
  if again->'payment'->>'invoice_number' <> code then raise exception 'Duplicate checkout changed number'; end if;
  again := public.reserve_payment(p || jsonb_build_object('id','99999999-9999-4999-8999-999999999999','checkout_hash',repeat('e',64)));
  other_code := again->'payment'->>'invoice_number';
  if other_code=code then raise exception 'Invoice numbers not unique'; end if;
  update public.payments set status='pending',revision=revision+1 where id=(p->>'id')::uuid;
  if (select invoice_number from public.payments where id=(p->>'id')::uuid) <> code then raise exception 'Status changed invoice'; end if;
  begin
    update public.payments set invoice_number=other_code where id=(p->>'id')::uuid;
    raise exception 'Invoice number mutable';
  exception when check_violation then null; end;
  begin
    update public.payments set merchant_ref='other' where id=(p->>'id')::uuid;
    raise exception 'Merchant reference mutable';
  exception when check_violation then null; end;
  begin
    update public.live_transactions set invoice_number=other_code where id=(p->>'id')::uuid;
    raise exception 'Admin invoice mutable';
  exception when check_violation then null; end;
  if has_function_privilege('anon','public.make_invoice_number(text,text,timestamptz)','execute') then raise exception 'Invoice generation exposed'; end if;
end; $$;
rollback;
