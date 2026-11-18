begin;
insert into public.managed_products(id,provider,provider_code,category,product,product_slug,name,price,active,fulfillment_mode,supplier_code)
values('10000000-0000-4000-8000-000000000001','manual','TASK-TEST','tasks','Tugas','tugas','Esai',10000,true,'manual','TASK-TEST');
insert into public.task_price_rules(product_id,price_per_page,price_per_revision,rush_fee_per_day,standard_days,max_pages,max_revisions)
values('10000000-0000-4000-8000-000000000001',2000,5000,1000,7,100,3);
do $$ begin
  if public.quote_task_order('10000000-0000-4000-8000-000000000001',3,2,1)<>26000 then raise exception 'Task quote mismatch'; end if;
  begin
    perform public.quote_task_order('10000000-0000-4000-8000-000000000001',3,2,4);
    raise exception 'Revision limit not enforced';
  exception when sqlstate 'PT409' then null; end;
end $$;
update public.task_price_rules set pricing_unit='minute',base_fee=0 where product_id='10000000-0000-4000-8000-000000000001';
do $$ begin
  if public.quote_task_order('10000000-0000-4000-8000-000000000001',5,7,0)<>10000 then raise exception 'Minute quote mismatch'; end if;
  begin
    insert into public.task_order_specs(payment_id,product_id,instructions,pages,deadline_days,purchased_revisions,quoted_amount,pricing_unit)
    values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Unit mismatch test',5,7,0,10000,'page');
    raise exception 'Wrong units accepted';
  exception when sqlstate 'PT409' then null; end;
end $$;
update public.task_price_rules set pricing_unit='custom' where product_id='10000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.quote_task_order('10000000-0000-4000-8000-000000000001',5,7,0);
    raise exception 'Custom request accepted an automatic price';
  exception when sqlstate 'PT409' then null; end;
  if (select count(*) from public.managed_products p join public.task_price_rules r on r.product_id=p.id
    where p.category='tasks' and p.provider_code like 'joki-%' and not p.active) <> 12 then
    raise exception 'Expected 12 draft service variants with pricing rules';
  end if;
end $$;
rollback;
