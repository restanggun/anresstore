begin;

create table public.admin_assistant_registry (
  id integer primary key check (id = 1),
  revision integer not null default 0,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object')
);
insert into public.admin_assistant_registry(id) values (1);
alter table public.admin_assistant_registry enable row level security;
revoke all on public.admin_assistant_registry from public, anon, authenticated;
grant select on public.admin_assistant_registry to service_role;

create function public.save_admin_assistant_registry(p_actor uuid, p_revision integer, p_config jsonb)
returns table(revision integer)
language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_assistant_registry r set config = p_config, revision = r.revision + 1
    where r.id = 1 and r.revision = p_revision returning r.revision into revision;
  if not found then return; end if;
  insert into public.admin_audit_log(actor_id,action,target) values (p_actor,'assistant.registry.saved',revision::text);
  return next;
end;
$$;

create table public.admin_assistant_batches (
  id uuid primary key,
  actor_id uuid not null,
  proposal_ids uuid[] not null check (cardinality(proposal_ids) between 1 and 20),
  expires_at timestamptz not null default now() + interval '15 minutes',
  applied_at timestamptz
);
alter table public.admin_assistant_batches enable row level security;
revoke all on public.admin_assistant_batches from public, anon, authenticated;
grant select, insert on public.admin_assistant_batches to service_role;

create function public.stage_admin_assistant_batch(p_id uuid, p_actor uuid, p_items jsonb)
returns table(expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'invalid assistant batch';
  end if;
  with drafts as (
    insert into public.admin_assistant_proposals(id,actor_id,product_id,category,product_slug,product_version,before_values,patch)
    select input.id,p_actor,input.product_id,input.category,input.product_slug,input.product_version,
      jsonb_build_object('price',input.before_price),jsonb_build_object('price',input.after_price)
    from jsonb_to_recordset(p_items) as input(id uuid,product_id uuid,category text,product_slug text,product_version timestamptz,before_price bigint,after_price bigint)
    where input.before_price between 1 and 100000000 and input.after_price between 1 and 100000000
    returning id
  ) select array_agg(drafts.id) into ids from drafts;
  if cardinality(ids) is distinct from jsonb_array_length(p_items) then raise exception 'invalid assistant price'; end if;
  return query insert into public.admin_assistant_batches as b(id,actor_id,proposal_ids)
    values(p_id,p_actor,ids) returning b.expires_at;
end;
$$;

create function public.apply_admin_assistant_batch(p_id uuid, p_actor uuid)
returns table(result text)
language plpgsql security definer set search_path = '' as $$
declare
  batch public.admin_assistant_batches%rowtype;
  item uuid;
  outcome text;
begin
  select b.* into batch from public.admin_assistant_batches b where b.id = p_id and b.actor_id = p_actor for update;
  if not found then return query select 'missing'::text; return; end if;
  if batch.applied_at is not null then return query select 'applied'::text; return; end if;
  if batch.expires_at <= clock_timestamp() then return query select 'expired'::text; return; end if;
  begin
    for item in select p.id from public.admin_assistant_proposals p
      where p.id = any(batch.proposal_ids) order by p.product_id,p.id for update
    loop
      select r.result into outcome from public.apply_admin_assistant_proposal(item,p_actor) r;
      if outcome is distinct from 'applied' then raise sqlstate 'P7501'; end if;
    end loop;
    if (select count(*) from public.admin_assistant_proposals p where p.id = any(batch.proposal_ids)
        and p.actor_id = p_actor and p.applied_at is not null) <> cardinality(batch.proposal_ids) then
      raise sqlstate 'P7501';
    end if;
    update public.admin_assistant_batches b set applied_at = clock_timestamp() where b.id = p_id;
    insert into public.admin_audit_log(actor_id,action,target) values (p_actor,'assistant.batch.applied',p_id::text);
  exception when sqlstate 'P7501' then
    return query select 'conflict'::text;
    return;
  end;
  return query select 'applied'::text;
end;
$$;

create table public.admin_assistant_runs (
  id uuid primary key,
  actor_id uuid not null,
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  created_at timestamptz not null default now()
);
create index admin_assistant_runs_created_idx on public.admin_assistant_runs(created_at desc);
alter table public.admin_assistant_runs enable row level security;
revoke all on public.admin_assistant_runs from public, anon, authenticated;
grant select, insert on public.admin_assistant_runs to service_role;

create function public.admin_assistant_finance_by_category(p_days integer)
returns table(category text, paid_count bigint, revenue numeric, known_revenue numeric, profit numeric, missing_cost bigint)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select (now() at time zone 'Asia/Jakarta')::date as today where p_days in (7,30,90)
  )
  select coalesce(r.category,'lainnya'), count(*), sum(r.amount),
    coalesce(sum(r.amount) filter(where r.accounting_cost is not null),0),
    coalesce(sum(r.amount-r.accounting_cost) filter(where r.accounting_cost is not null),0),
    count(*) filter(where r.accounting_cost is null)
  from public.admin_transaction_records r cross join bounds b
  where r.payment_status = 'paid'
    and r.created_at >= ((b.today-(p_days-1))::timestamp at time zone 'Asia/Jakarta')
    and r.created_at < ((b.today+1)::timestamp at time zone 'Asia/Jakarta')
  group by 1 order by 3 desc, 1;
$$;

revoke all on function public.save_admin_assistant_registry(uuid,integer,jsonb), public.stage_admin_assistant_batch(uuid,uuid,jsonb), public.apply_admin_assistant_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_admin_assistant_registry(uuid,integer,jsonb), public.stage_admin_assistant_batch(uuid,uuid,jsonb), public.apply_admin_assistant_batch(uuid,uuid) to service_role;
revoke all on function public.admin_assistant_finance_by_category(integer) from public,anon,authenticated;
grant execute on function public.admin_assistant_finance_by_category(integer) to service_role;
notify pgrst, 'reload schema';
commit;
