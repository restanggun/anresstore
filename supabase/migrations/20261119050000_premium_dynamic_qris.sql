begin;
alter table public.premium_qris_settings add column if not exists payload text;
alter table public.premium_qris_settings alter column image drop not null;

create or replace function public.prepare_premium_order(p_order uuid,p_user uuid,p_qr_image text)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare saved public.premium_orders;
begin
 if p_qr_image is null or char_length(p_qr_image)>180000 then raise exception 'Generated QR image is invalid' using errcode='PT400'; end if;
 update public.premium_orders set qr_image=p_qr_image,qr_expires_at=now()+interval '24 hours',status='awaiting_payment',updated_at=now()
 where id=p_order and user_id=p_user and status='awaiting_qr' returning * into saved;
 if saved.id is null then raise exception 'Premium order cannot be prepared' using errcode='PT409'; end if;
 return next saved;
end; $$;
revoke all on function public.prepare_premium_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_premium_order(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
