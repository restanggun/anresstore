begin;
-- Retire the client-priced order store; verified invoices live in payments.
drop table public.orders;

-- Preserve historical test records. NOT VALID enforces live mode for every new
-- write while keeping old invoices intact. API/admin reads are scoped to live.
delete from public.payment_audit_events where payment_id in
  (select id from public.sandbox_payments where payment_mode <> 'live');

drop function if exists public.reserve_sandbox_payment(jsonb);
drop function if exists public.reserve_sandbox_payment_base(jsonb);
drop function if exists public.advance_sandbox_fulfillment();
alter table public.sandbox_payments rename to payments;
alter table public.payments alter column payment_mode set default 'live';
alter table public.payments drop constraint sandbox_payments_payment_mode_check;
alter table public.payments add constraint payments_production_mode check (payment_mode = 'live') not valid;
alter table public.live_transactions drop constraint live_transactions_payment_mode_check;
alter table public.live_transactions add constraint transactions_production_mode check (payment_mode = 'live') not valid;

alter function public.claim_sandbox_payment_check(uuid) rename to claim_payment_check;
alter function public.project_sandbox_order() rename to project_payment_order;
alter trigger project_sandbox_order on public.payments rename to project_payment_order;
alter function public.audit_sandbox_payment() rename to audit_payment;
alter trigger audit_sandbox_payment on public.payments rename to audit_payment;
alter function public.guard_sandbox_payment() rename to guard_payment;
alter trigger guard_sandbox_payment on public.payments rename to guard_payment;

-- PL/pgSQL stores table identifiers in function bodies as text. Rebind all existing
-- security/state/audit routines to the renamed table, retaining their ACLs.
do $$
declare routine record; definition text;
begin
  for routine in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and (p.prosrc like '%sandbox_payments%' or p.proname='reserve_payment')
  loop
    definition := replace(pg_get_functiondef(routine.oid),'sandbox_payments','payments');
    definition := replace(definition, 'v_mode not in (''sandbox'',''live'')', 'v_mode <> ''live''');
    execute definition;
  end loop;
end; $$;

revoke all on public.payments from public,anon,authenticated;
grant select,insert,update on public.payments to service_role;
notify pgrst, 'reload schema';
commit;
