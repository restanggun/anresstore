begin;
alter table public.live_transactions drop constraint live_transactions_category_check;
alter table public.live_transactions add constraint live_transactions_category_check
  check (category in ('game', 'prepaid', 'apps'));
-- A production provider order must have a verified payment reference and no
-- previous provider reference. Sandbox records live in a different table.
create or replace function public.claim_live_fulfillment(p_id uuid)
returns setof public.live_transactions
language sql security invoker set search_path = '' as $$
  update public.live_transactions
     set fulfillment_status = 'dispatching', updated_at = now()
   where id = p_id and payment_status = 'paid' and fulfillment_status = 'ready'
     and payment_reference is not null and length(payment_reference) > 0
     and provider_reference is null
  returning *;
$$;
revoke all on function public.claim_live_fulfillment(uuid) from public, anon, authenticated;
grant execute on function public.claim_live_fulfillment(uuid) to service_role;
commit;
