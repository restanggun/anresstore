begin;
alter table public.payments drop constraint payments_production_mode;
alter table public.payments add constraint payments_supported_mode check (payment_mode in ('sandbox','live'));
alter table public.live_transactions drop constraint transactions_production_mode;
alter table public.live_transactions add constraint transactions_supported_mode check (payment_mode in ('sandbox','live'));
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_payment(jsonb)'::regprocedure);
  definition := replace(definition, 'v_mode <> ''live''', 'v_mode not in (''sandbox'',''live'')');
  execute definition;
end; $$;
notify pgrst, 'reload schema';
commit;
