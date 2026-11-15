begin;
-- Complete the production cutover: remove historical nonproduction records,
-- never reclassify them as real transactions, and validate the mode constraints.
delete from public.live_transactions where payment_mode <> 'live';
delete from public.payment_audit_events where payment_id in
  (select id from public.payments where payment_mode <> 'live');
delete from public.payments where payment_mode <> 'live';
alter table public.payments validate constraint payments_production_mode;
alter table public.live_transactions validate constraint transactions_production_mode;
notify pgrst, 'reload schema';
commit;
