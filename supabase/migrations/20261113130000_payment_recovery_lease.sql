-- Allow workers to reconcile a lost create response by merchant invoice ID.
begin;
create or replace function public.claim_sandbox_payment_check(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  update public.sandbox_payments set provider_check_until = now() + interval '30 seconds'
    where id = p_id and status in ('creating','pending','unknown','paid')
      and (reference is not null or status = 'unknown' or (status = 'creating' and created_at < now() - interval '2 minutes'))
      and (provider_check_until is null or provider_check_until <= now())
    returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.claim_sandbox_payment_check(uuid) from public,anon,authenticated;
grant execute on function public.claim_sandbox_payment_check(uuid) to service_role;
commit;
