do $$
begin
  if to_regclass('public.sandbox_payments') is not null or to_regclass('public.orders') is not null then
    raise exception 'Retired stores still exist';
  end if;
  if (select count(*) from public.payments where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    or (select count(*) from public.live_transactions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then
    raise exception 'Production invoice lost during cutover';
  end if;
  if exists(select 1 from public.payments where payment_mode <> 'live')
    or exists(select 1 from public.live_transactions where payment_mode <> 'live')
    or exists(select 1 from public.payment_audit_events where payment_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'Nonproduction data survived cutover';
  end if;
  if to_regprocedure('public.reserve_sandbox_payment(jsonb)') is not null
    or to_regprocedure('public.advance_sandbox_fulfillment()') is not null then
    raise exception 'Retired RPC remains';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%sandbox%') then
    raise exception 'Retired function name remains';
  end if;
  if (select count(*) from public.payment_audit_events where payment_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then
    raise exception 'Production audit history lost';
  end if;
end; $$;
-- Remove local fixtures before testing reservation and spending budgets.
delete from public.payment_audit_events where payment_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.live_transactions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.payments where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
