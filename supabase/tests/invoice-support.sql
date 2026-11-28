begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  guest_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  guest_order uuid := gen_random_uuid();
  premium_id uuid := gen_random_uuid();
  product_id uuid := gen_random_uuid();
  room_id uuid := gen_random_uuid();
  premium_room_id uuid := gen_random_uuid();
  reference text;
  context record;
  result record;
  fixture jsonb := jsonb_build_object('category','game','productSlug','game-fixture',
    'productName','Support fixture','target','1234','amount',15000);
begin
  insert into auth.users(id,email,email_confirmed_at)
  values(owner_id,'invoice-support-owner@example.com',now()),(other_id,'invoice-support-other@example.com',now()),
    (guest_id,'invoice-support-guest@example.com',now());
  insert into public.users(id,full_name)
  values(owner_id,'Invoice support owner'),(other_id,'Invoice support other'),
    (guest_id,'Invoice support guest') on conflict do nothing;
  select created.invoice_number into reference from public.admin_manage_invoice(owner_id,order_id,'create',fixture ||
    jsonb_build_object('identityHash',repeat('a',64),'email','invoice-support-owner@example.com')) created;

  select * into context from public.invoice_support_context(reference,owner_id,null,null);
  if not found or context.invoice_id<>order_id or context.ticket_id is not null then
    raise exception 'Expected own invoice and no open ticket';
  end if;
  if exists(select 1 from public.invoice_support_context(reference,other_id,null,null))
    or exists(select 1 from public.create_invoice_support_ticket(gen_random_uuid(),reference,other_id,null,null,'Invalid ticket','Cannot link this invoice')) then
    raise exception 'A different account can access the invoice';
  end if;
  select * into result from public.create_invoice_support_ticket(room_id,reference,owner_id,null,null,'Payment issue','My order needs help.');
  if not found or result.id<>room_id or result.reused
    or not exists(select 1 from public.support_conversations c where c.id=room_id and c.invoice_id=order_id and c.user_id=owner_id)
    or not exists(select 1 from public.support_messages m where m.conversation_id=room_id and m.body like '%'||reference||'%') then
    raise exception 'New ticket did not retain invoice context';
  end if;
  select * into result from public.create_invoice_support_ticket(gen_random_uuid(),order_id::text,owner_id,null,null,'Duplicate tab','Different request.');
  if not found or result.id<>room_id or not result.reused then
    raise exception 'Open ticket was not reused';
  end if;

  perform public.admin_manage_invoice(owner_id,guest_order,'create',fixture ||
    jsonb_build_object('identityHash',repeat('b',64),'email','guest-before-login@example.com'));
  if exists(select 1 from public.invoice_support_context(guest_order::text,guest_id,null,'guest-before-login@example.com'))
    or exists(select 1 from public.invoice_support_context(guest_order::text,guest_id,repeat('b',64),'wrong@example.com'))
    or not exists(select 1 from public.invoice_support_context(guest_order::text,guest_id,repeat('b',64),'guest-before-login@example.com')) then
    raise exception 'Guest continuation must match the browser and the verified email';
  end if;

  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active)
  values(product_id,'manual','SUPPORT-FIXTURE','apps','Support app','support-app','Monthly',22000,true);
  insert into public.support_conversations(id,user_id,subject,status)
  values(premium_room_id,owner_id,'Existing premium chat','in_progress');
  insert into public.premium_orders(id,user_id,customer_email,product_id,product_name,access_type,duration_days,guarantee_days,
    guarantee_terms,amount,status,conversation_id)
  values(premium_id,owner_id,'invoice-support-owner@example.com',product_id,'Support app','private',30,0,'Fixture guarantee',22000,'paid',premium_room_id);
  select * into context from public.invoice_support_context(premium_id::text,owner_id,null,null);
  if not found or context.ticket_id<>premium_room_id then raise exception 'Existing premium chat was not resolved'; end if;

  if has_function_privilege('authenticated','public.invoice_support_context(text,uuid,text,text)','execute')
    or has_function_privilege('anon','public.create_invoice_support_ticket(uuid,text,uuid,text,text,text,text)','execute') then
    raise exception 'Invoice support functions must remain service-role only';
  end if;
end;
$$;
rollback;
