begin;
-- New invoices use 26 characters. Existing invoice numbers and merchant references stay immutable.
create or replace function public.make_invoice_number(subproduct text, product text, issued_at timestamptz) returns text
language sql volatile set search_path='' as $$
  select 'ARNS-' || to_char(issued_at at time zone 'Asia/Jakarta','YYMMDD')
    || '-' || upper(left(replace(gen_random_uuid()::text,'-',''),14));
$$;
alter table public.payments drop constraint payment_invoice_number_format;
alter table public.payments add constraint payment_invoice_number_format check (
  invoice_number ~ '^ARNS-([0-9]{6}-[A-F0-9]{14}|[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-[0-9]{8}-[A-F0-9]{16})$'
);
-- Explicit service-role RPC for real supplier orders paid through the sandbox gateway.
-- Keep the same atomic claim, shared spending limits, and no-repeat guarantees as live.
create or replace function public.claim_sandbox_fulfillment(p_id uuid)
returns setof public.live_transactions language plpgsql security invoker set search_path='' as $$
declare lim public.fulfillment_limits; candidate public.live_transactions;
  hour_cost bigint; day_cost bigint; hour_orders bigint; cutoff timestamptz;
begin
  -- Lock the singleton before reading totals: parallel workers cannot overspend.
  select * into lim from public.fulfillment_limits where id=true for update;
  if not found or lim.paused then return; end if;
  cutoff := clock_timestamp();
  select * into candidate from public.live_transactions where id=p_id for update;
  if not found or candidate.payment_status <> 'paid' or candidate.fulfillment_status <> 'ready'
    or candidate.payment_mode <> 'sandbox' or candidate.fulfillment_mode <> 'vipayment'
    or candidate.review_required or candidate.payment_reference is null or length(candidate.payment_reference)=0
    or candidate.provider_reference is not null then return; end if;
  if exists(select 1 from public.fulfillment_spend_reservations where order_id=p_id) then return; end if;
  select coalesce(sum(cost) filter(where reserved_at>cutoff-interval '1 hour'),0),
    coalesce(sum(cost),0),count(*) filter(where reserved_at>cutoff-interval '1 hour')
    into hour_cost,day_cost,hour_orders from public.fulfillment_spend_reservations
    where reserved_at>cutoff-interval '24 hours';
  if candidate.provider_cost is null or candidate.provider_cost<=0
    or candidate.provider_cost>lim.max_order_cost or hour_cost+candidate.provider_cost>lim.max_hour_cost
    or day_cost+candidate.provider_cost>lim.max_day_cost or hour_orders>=lim.max_hour_orders then
    update public.live_transactions set review_required=true,updated_at=clock_timestamp() where id=p_id;
    return;
  end if;
  insert into public.fulfillment_spend_reservations(order_id,cost) values(p_id,candidate.provider_cost);
  return query update public.live_transactions set fulfillment_status='dispatching',updated_at=clock_timestamp()
    where id=p_id returning *;
end; $$;
revoke all on function public.claim_sandbox_fulfillment(uuid) from public,anon,authenticated;
grant execute on function public.claim_sandbox_fulfillment(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
