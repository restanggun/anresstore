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
rollback;
