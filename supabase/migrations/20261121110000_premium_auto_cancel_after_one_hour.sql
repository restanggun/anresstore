begin;

-- Existing unpaid QRIS orders inherit the one-hour deadline from their creation.
update public.premium_orders
set qr_expires_at = least(qr_expires_at, created_at + interval '1 hour')
where payment_mode = 'live'
  and status = 'awaiting_payment'
  and qr_expires_at is not null
  and proof_image is null;

-- Do not leave orders that are already past their deadline waiting for the worker's first pass.
update public.premium_orders
set status = 'cancelled', updated_at = clock_timestamp()
where payment_mode = 'live'
  and proof_image is null
  and (
    (status = 'awaiting_qr' and created_at <= clock_timestamp() - interval '1 hour')
    or (status = 'awaiting_payment' and coalesce(qr_expires_at, created_at + interval '1 hour') <= clock_timestamp())
  );

create or replace function public.prepare_premium_order(p_order uuid,p_user uuid,p_guest_hash text,p_qr_image text)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare saved public.premium_orders;
begin
  if p_qr_image is null or char_length(p_qr_image)>180000 then raise exception 'Generated QR image is invalid' using errcode='PT400'; end if;
  update public.premium_orders
    set qr_image=p_qr_image,qr_expires_at=now()+interval '1 hour',status='awaiting_payment',updated_at=now()
  where id=p_order
    and ((p_user is not null and user_id=p_user) or (p_user is null and guest_session_hash=p_guest_hash))
    and status='awaiting_qr'
  returning * into saved;
  if saved.id is null then raise exception 'Premium order cannot be prepared' using errcode='PT409'; end if;
  return next saved;
end; $$;

create or replace function public.cancel_expired_premium_orders()
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update public.premium_orders
  set status='cancelled',updated_at=clock_timestamp()
  where payment_mode='live'
    and proof_image is null
    and (
      (status='awaiting_qr' and created_at<=clock_timestamp()-interval '1 hour')
      or (status='awaiting_payment' and coalesce(qr_expires_at,created_at+interval '1 hour')<=clock_timestamp())
    );
  get diagnostics affected = row_count;
  return affected;
end; $$;

revoke all on function public.cancel_expired_premium_orders() from public, anon, authenticated;
grant execute on function public.cancel_expired_premium_orders() to service_role;
revoke all on function public.prepare_premium_order(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.prepare_premium_order(uuid,uuid,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
