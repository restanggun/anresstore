begin;
do $$
declare
  actor uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  premium_id uuid := gen_random_uuid();
  product_key uuid := gen_random_uuid();
  v timestamptz;
  invoice text;
  create_data jsonb := jsonb_build_object('identityHash',repeat('a',64),'category','game','productSlug','game-test',
    'productName','Manual test','target','000123','amount',12000,'email','customer@example.com');
begin
  select r.invoice_number into invoice from public.admin_manage_invoice(actor,order_id,'create',create_data) r;
  perform public.admin_manage_invoice(actor,order_id,'create',create_data);
  if invoice is null or (select count(*) from public.admin_transaction_records where id=order_id::text)<>1 then
    raise exception 'Manual invoice or retry failed';
  end if;
  select updated_at into v from public.invoices where id=order_id;
  begin
    perform public.admin_manage_invoice(actor,order_id,'status',jsonb_build_object('field','payment','status','paid','version',v));
    raise exception 'Payment accepted without evidence';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.admin_manage_invoice(actor,order_id,'edit',jsonb_build_object('productName','Updated test','amount',14000,
    'target','000456','targetZone','001','email','updated@example.com','version',v));
  if not exists(select 1 from public.live_transactions where id=order_id and amount=14000 and target='000456' and target_zone='001')
    or not exists(select 1 from public.invoices where id=order_id and invoice_number=invoice and amount=14000 and product_name='Updated test') then
    raise exception 'Edit did not propagate to invoice and fulfillment';
  end if;
  perform public.admin_manage_invoice(actor,order_id,'proof','{"image":"fixture","note":"bank transfer"}');
  select updated_at into v from public.invoices where id=order_id;
  perform public.admin_manage_invoice(actor,order_id,'status',jsonb_build_object('field','payment','status','paid','version',v));
  select updated_at into v from public.invoices where id=order_id;
  perform public.admin_manage_invoice(actor,order_id,'status',jsonb_build_object('field','fulfillment','status','completed','version',v));
  perform public.admin_manage_invoice(actor,order_id,'share',jsonb_build_object('tokenHash',repeat('b',64)));
  perform public.submit_linked_invoice_review(repeat('b',64),4.5,'Verified guest review');
  if not exists(select 1 from public.product_reviews where invoice_id=order_id and status='pending' and purchase_verified) then
    raise exception 'Linked review was not connected to the original invoice';
  end if;
  begin
    perform public.submit_linked_invoice_review(repeat('b',64),5,'Duplicate review');
    raise exception 'Duplicate review accepted';
  exception when unique_violation then null;
  end;
  select updated_at into v from public.invoices where id=order_id;
  perform public.admin_manage_invoice(actor,order_id,'archive',jsonb_build_object('version',v));
  if exists(select 1 from public.admin_transaction_records where id=order_id::text)
    or not exists(select 1 from public.invoices where id=order_id and archived_at is not null)
    or not exists(select 1 from public.payment_audit_events where payment_id=order_id and next_status='paid')
    or not exists(select 1 from public.admin_audit_log where target=order_id::text and action='invoice.archive') then
    raise exception 'Archive did not preserve audit and hide the invoice';
  end if;

  insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active)
  values(product_key,'manual','INVOICE-TEST','apps','Test app','test-app','Monthly',22000,true);
  insert into public.premium_orders(id,guest_session_hash,customer_email,product_id,product_name,access_type,duration_days,guarantee_days,guarantee_terms,amount,status,created_at)
  values(premium_id,repeat('c',64),'customer@example.com',product_key,'Test app','private',30,7,'Example guarantee',22000,'awaiting_qr',now()-interval '2 hours');
  perform public.cancel_expired_premium_orders();
  select updated_at into v from public.invoices where id=premium_id and payment_status='cancelled';
  if not found then raise exception 'Premium was not cancelled'; end if;
  perform public.admin_manage_invoice(actor,premium_id,'restore',jsonb_build_object('version',v));
  perform public.cancel_expired_premium_orders();
  if not exists(select 1 from public.premium_orders where id=premium_id and status='awaiting_qr'
      and qr_expires_at>now()+interval '59 minutes') then
    raise exception 'Premium cancelled again after restore';
  end if;
  perform public.admin_manage_invoice(actor,premium_id,'proof','{"image":"fixture"}');
  select updated_at into v from public.invoices where id=premium_id;
  perform public.admin_manage_invoice(actor,premium_id,'status',jsonb_build_object('field','payment','status','paid','version',v));
  if not exists(select 1 from public.premium_orders where id=premium_id and status='paid' and proof_image='fixture' and paid_at is not null)
    or has_function_privilege('authenticated','public.admin_manage_invoice(uuid,uuid,text,jsonb)','EXECUTE') then
    raise exception 'Premium proof or RPC permissions failed';
  end if;
end; $$;
rollback;
