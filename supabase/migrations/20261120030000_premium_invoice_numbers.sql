begin;

alter table public.premium_orders add column invoice_number text;

update public.premium_orders
set invoice_number = public.make_invoice_number('APPS', product_name, created_at);

alter table public.premium_orders
  alter column invoice_number set not null,
  add constraint premium_orders_invoice_number_unique unique (invoice_number),
  add constraint premium_orders_invoice_number_format
    check (invoice_number ~ '^ARNS-[0-9]{6}-[A-F0-9]{14}$');

create function public.assign_premium_invoice_number()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op = 'INSERT' and new.invoice_number is null then
    new.invoice_number := public.make_invoice_number('APPS', new.product_name, coalesce(new.created_at, now()));
  elsif tg_op = 'UPDATE' and new.invoice_number is distinct from old.invoice_number then
    raise exception 'Immutable invoice number' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger premium_invoice_number_before_write
before insert or update on public.premium_orders
for each row execute function public.assign_premium_invoice_number();

revoke all on function public.assign_premium_invoice_number() from public, anon, authenticated;
grant execute on function public.assign_premium_invoice_number() to service_role;

commit;
