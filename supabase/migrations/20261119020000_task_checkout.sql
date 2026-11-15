begin;

create table public.task_price_rules (
  product_id uuid primary key references public.managed_products(id) on delete cascade,
  price_per_page bigint not null check (price_per_page between 0 and 1000000),
  price_per_revision bigint not null check (price_per_revision between 0 and 1000000),
  rush_fee_per_day bigint not null check (rush_fee_per_day between 0 and 1000000),
  standard_days integer not null check (standard_days between 1 and 90),
  max_pages integer not null check (max_pages between 1 and 500),
  max_revisions integer not null check (max_revisions between 0 and 20),
  updated_at timestamptz not null default now()
);
alter table public.task_price_rules enable row level security;
revoke all on public.task_price_rules from public,anon,authenticated;
grant select,insert,update on public.task_price_rules to service_role;
create function public.bump_task_price_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  update public.catalog_versions set version=version+1 where category='tasks';
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
create trigger task_price_catalog_version before insert or update or delete on public.task_price_rules
for each row execute function public.bump_task_price_version();

create table public.task_order_specs (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  product_id uuid not null references public.managed_products(id) on delete restrict,
  instructions text not null check (char_length(instructions) between 10 and 3000),
  reference_url text check (char_length(reference_url) <= 500),
  pages integer not null check (pages between 1 and 500),
  deadline_days integer not null check (deadline_days between 1 and 90),
  purchased_revisions integer not null check (purchased_revisions between 0 and 20),
  quoted_amount bigint not null check (quoted_amount between 1 and 100000000),
  workflow_status text not null default 'awaiting_payment' check (workflow_status in ('awaiting_payment','queued','working','delivered','revision_requested','revision_working','completed','cancelled')),
  delivered_url text check (char_length(delivered_url) <= 500),
  delivered_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.task_order_specs enable row level security;
revoke all on public.task_order_specs from public,anon,authenticated;
grant select,insert,update on public.task_order_specs to service_role;

create table public.task_revisions (
  id uuid primary key,
  payment_id uuid not null references public.task_order_specs(payment_id) on delete restrict,
  request_number integer not null check (request_number between 1 and 20),
  customer_note text not null check (char_length(customer_note) between 10 and 2000),
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected','delivered')),
  admin_note text check (char_length(admin_note) <= 2000),
  result_url text check (char_length(result_url) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(payment_id,request_number)
);
alter table public.task_revisions enable row level security;
revoke all on public.task_revisions from public,anon,authenticated;
grant select,insert,update on public.task_revisions to service_role;

create function public.project_task_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.source='tasks' and new.status='paid' and old.status is distinct from 'paid' then
    update public.task_order_specs set workflow_status='queued'
      where payment_id=new.id and workflow_status='awaiting_payment';
  elsif new.source='tasks' and new.status='refunded' then
    update public.task_order_specs set workflow_status='cancelled'
      where payment_id=new.id and workflow_status not in ('completed','cancelled');
  end if;
  return new;
end; $$;
create trigger project_task_payment after update of status on public.payments
for each row execute function public.project_task_payment();

create function public.start_task_order(p_payment uuid)
returns setof public.task_order_specs language plpgsql security invoker set search_path='' as $$
begin
  update public.task_order_specs set workflow_status='working'
    where payment_id=p_payment and workflow_status='queued'
      and exists(select 1 from public.payments where id=p_payment and status='paid');
  if not found then raise exception 'Task cannot start' using errcode='PT409'; end if;
  update public.live_transactions set fulfillment_status='processing',updated_at=now()
    where id=p_payment and fulfillment_mode='manual' and payment_status='paid' and fulfillment_status='ready';
  return query select * from public.task_order_specs where payment_id=p_payment;
end; $$;

create function public.request_task_revision(p_payment uuid,p_user uuid,p_id uuid,p_note text)
returns setof public.task_revisions language plpgsql security invoker set search_path='' as $$
declare task public.task_order_specs; serial integer; used integer;
begin
  select * into task from public.task_order_specs where payment_id=p_payment for update;
  if task.payment_id is null or task.workflow_status<>'delivered' or char_length(trim(p_note)) not between 10 and 2000
    or not exists(select 1 from public.payments where id=p_payment and owner_user_id=p_user and status='paid') then
    raise exception 'Revision unavailable' using errcode='PT409';
  end if;
  select count(*)+1 into serial from public.task_revisions where payment_id=p_payment;
  select count(*) into used from public.task_revisions where payment_id=p_payment and decision in ('accepted','delivered');
  if used>=task.purchased_revisions or serial>20 or exists(select 1 from public.task_revisions where payment_id=p_payment and decision='pending') then
    raise exception 'Revision quota exhausted' using errcode='PT409';
  end if;
  insert into public.task_revisions(id,payment_id,request_number,customer_note)
    values(p_id,p_payment,serial,trim(p_note));
  update public.task_order_specs set workflow_status='revision_requested' where payment_id=p_payment;
  return query select * from public.task_revisions where id=p_id;
end; $$;

create function public.decide_task_revision(p_payment uuid,p_id uuid,p_decision text,p_note text)
returns setof public.task_revisions language plpgsql security invoker set search_path='' as $$
declare task public.task_order_specs;
begin
  select * into task from public.task_order_specs where payment_id=p_payment for update;
  if task.workflow_status<>'revision_requested' or p_decision not in ('accepted','rejected')
    or char_length(trim(p_note)) not between 3 and 2000 then raise exception 'Revision decision unavailable' using errcode='PT409'; end if;
  update public.task_revisions set decision=p_decision,admin_note=trim(p_note),decided_at=now()
    where id=p_id and payment_id=p_payment and decision='pending';
  if not found then raise exception 'Revision not pending' using errcode='PT409'; end if;
  update public.task_order_specs set workflow_status=case when p_decision='accepted' then 'revision_working' else 'delivered' end
    where payment_id=p_payment;
  return query select * from public.task_revisions where id=p_id;
end; $$;

create function public.deliver_task_result(p_payment uuid,p_url text)
returns setof public.task_order_specs language plpgsql security invoker set search_path='' as $$
declare task public.task_order_specs;
begin
  select * into task from public.task_order_specs where payment_id=p_payment for update;
  if task.workflow_status not in ('working','revision_working') or p_url !~ '^https://[^ ]+$' or char_length(p_url)>500
    or not exists(select 1 from public.payments where id=p_payment and status='paid') then
    raise exception 'Delivery unavailable' using errcode='PT409';
  end if;
  if task.workflow_status='revision_working' then
    update public.task_revisions set decision='delivered',result_url=p_url
      where id=(select id from public.task_revisions where payment_id=p_payment and decision='accepted' order by decided_at desc limit 1);
    if not found then raise exception 'Accepted revision missing' using errcode='PT409'; end if;
  end if;
  update public.task_order_specs set workflow_status='delivered',delivered_url=p_url,delivered_at=now() where payment_id=p_payment;
  return query select * from public.task_order_specs where payment_id=p_payment;
end; $$;

create function public.complete_task_order(p_payment uuid,p_user uuid)
returns setof public.task_order_specs language plpgsql security invoker set search_path='' as $$
begin
  update public.task_order_specs set workflow_status='completed',accepted_at=now()
    where payment_id=p_payment and workflow_status='delivered'
      and exists(select 1 from public.payments where id=p_payment and owner_user_id=p_user and status='paid');
  if not found then raise exception 'Task cannot be completed' using errcode='PT409'; end if;
  update public.live_transactions set fulfillment_status='completed',provider_note='Hasil tugas diterima pelanggan.',updated_at=now()
    where id=p_payment and fulfillment_mode='manual' and payment_status='paid' and fulfillment_status='processing';
  return query select * from public.task_order_specs where payment_id=p_payment;
end; $$;

create function public.quote_task_order(p_product uuid,p_pages integer,p_days integer,p_revisions integer)
returns bigint language plpgsql security invoker set search_path='' as $$
declare variant public.managed_products; rule public.task_price_rules; total bigint;
begin
  select * into variant from public.managed_products where id=p_product and category='tasks' and active and deleted_at is null for share;
  select * into rule from public.task_price_rules where product_id=p_product for share;
  if variant.id is null or rule.product_id is null or p_pages is null or p_days is null or p_revisions is null
    or p_pages<1 or p_pages>rule.max_pages or p_days<1 or p_days>90 or p_revisions<0 or p_revisions>rule.max_revisions then
    raise exception 'Task pricing unavailable' using errcode='PT409';
  end if;
  total := variant.price + rule.price_per_page*p_pages + rule.price_per_revision*p_revisions
    + rule.rush_fee_per_day*greatest(rule.standard_days-p_days,0);
  if total<1 or total>100000000 then raise exception 'Task price out of range' using errcode='PT409'; end if;
  return total;
end; $$;

create function public.reserve_task_payment(p_payment jsonb,p_task jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; product_id uuid; quoted bigint; existing public.task_order_specs;
begin
  if p_payment->>'source'<>'tasks' or p_payment->>'fulfillment_mode'<>'manual' or p_payment->>'payment_mode' not in ('live','sandbox')
    or p_payment->>'provider_code' !~ '^managed\.[0-9a-f-]{36}$' then
    raise exception 'Invalid task payment' using errcode='PT409';
  end if;
  product_id := substring(p_payment->>'provider_code' from 9)::uuid;
  quoted := public.quote_task_order(product_id,(p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer);
  if quoted<>(p_payment->>'amount')::bigint then raise exception 'Task price changed' using errcode='PT409'; end if;
  result := public.reserve_payment(p_payment);
  insert into public.task_order_specs(payment_id,product_id,instructions,reference_url,pages,deadline_days,purchased_revisions,quoted_amount)
  values((result->'payment'->>'id')::uuid,product_id,p_task->>'instructions',nullif(p_task->>'reference_url',''),
    (p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer,quoted)
  on conflict(payment_id) do nothing;
  select * into existing from public.task_order_specs where payment_id=(result->'payment'->>'id')::uuid;
  if existing.product_id<>product_id or existing.instructions<>p_task->>'instructions'
    or existing.reference_url is distinct from nullif(p_task->>'reference_url','')
    or existing.pages<>(p_task->>'pages')::integer or existing.deadline_days<>(p_task->>'deadline_days')::integer
    or existing.purchased_revisions<>(p_task->>'revisions')::integer or existing.quoted_amount<>quoted then
    raise exception 'Task order conflict' using errcode='PT409';
  end if;
  return result;
end; $$;

revoke all on function public.bump_task_price_version(),public.project_task_payment(),public.start_task_order(uuid),public.request_task_revision(uuid,uuid,uuid,text),public.decide_task_revision(uuid,uuid,text,text),public.deliver_task_result(uuid,text),public.complete_task_order(uuid,uuid),public.quote_task_order(uuid,integer,integer,integer),public.reserve_task_payment(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bump_task_price_version(),public.project_task_payment(),public.start_task_order(uuid),public.request_task_revision(uuid,uuid,uuid,text),public.decide_task_revision(uuid,uuid,text,text),public.deliver_task_result(uuid,text),public.complete_task_order(uuid,uuid),public.quote_task_order(uuid,integer,integer,integer),public.reserve_task_payment(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
