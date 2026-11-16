begin;

-- Pause invoice guards while preserving each existing suffix and merchant reference.
drop trigger if exists assign_payment_invoice on public.payments;
drop trigger if exists project_payment_order on public.payments;
drop trigger if exists guard_transaction_invoice on public.live_transactions;
drop trigger if exists premium_invoice_number_before_write on public.premium_orders;

create or replace function public.make_invoice_number(subproduct text, product text, issued_at timestamptz)
returns text language sql volatile set search_path='' as $$
  select 'ANRS-' || to_char(issued_at at time zone 'Asia/Jakarta','YYMMDD')
    || '-' || upper(left(replace(gen_random_uuid()::text,'-',''),14));
$$;

alter table public.payments drop constraint if exists payment_invoice_number_format;
alter table public.premium_orders drop constraint if exists premium_orders_invoice_number_format;

update public.payments set invoice_number='ANRS-'||substring(invoice_number from 6) where invoice_number like 'ARNS-%';
update public.live_transactions set invoice_number='ANRS-'||substring(invoice_number from 6) where invoice_number like 'ARNS-%';
update public.premium_orders set invoice_number='ANRS-'||substring(invoice_number from 6) where invoice_number like 'ARNS-%';

alter table public.payments add constraint payment_invoice_number_format
  check (invoice_number ~ '^ANRS-([0-9]{6}-[A-F0-9]{14}|[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16})$');
alter table public.premium_orders add constraint premium_orders_invoice_number_format
  check (invoice_number ~ '^ANRS-[0-9]{6}-[A-F0-9]{14}$');

create trigger assign_payment_invoice before insert or update on public.payments
for each row execute function public.assign_payment_invoice();
create trigger project_payment_order after insert or update on public.payments
for each row execute function public.project_payment_order();
create trigger guard_transaction_invoice before insert or update on public.live_transactions
for each row execute function public.guard_transaction_invoice();
create trigger premium_invoice_number_before_write before insert or update on public.premium_orders
for each row execute function public.assign_premium_invoice_number();

notify pgrst, 'reload schema';
commit;
