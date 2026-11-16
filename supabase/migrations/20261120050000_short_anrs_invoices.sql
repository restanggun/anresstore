begin;

drop trigger if exists assign_payment_invoice on public.payments;
drop trigger if exists project_payment_order on public.payments;
drop trigger if exists guard_transaction_invoice on public.live_transactions;
drop trigger if exists premium_invoice_number_before_write on public.premium_orders;

update public.payments
set invoice_number=public.make_invoice_number(provider_code,product_name,created_at);

update public.live_transactions t
set invoice_number=p.invoice_number
from public.payments p
where p.id=t.id and t.invoice_number is distinct from p.invoice_number;

update public.premium_orders
set invoice_number=public.make_invoice_number('APPS',product_name,created_at);

alter table public.payments drop constraint if exists payment_invoice_number_format;
alter table public.payments add constraint payment_invoice_number_format
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
