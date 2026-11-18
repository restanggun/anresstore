begin;

create or replace function public.admin_assistant_finance_by_category(p_days integer)
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

revoke all on function public.admin_assistant_finance_by_category(integer) from public,anon,authenticated;
grant execute on function public.admin_assistant_finance_by_category(integer) to service_role;

notify pgrst, 'reload schema';
commit;
