begin;

create table public.premium_qris_settings (
 id integer primary key check (id=1),
 image text not null check (char_length(image)<=180000),
 updated_at timestamptz not null default now()
);
alter table public.premium_qris_settings enable row level security;
revoke all on public.premium_qris_settings from public,anon,authenticated;
grant select,insert,update,delete on public.premium_qris_settings to service_role;

alter table public.premium_orders alter column qr_image drop not null;
alter table public.premium_orders alter column qr_expires_at drop not null;

create function public.prepare_premium_order(p_order uuid,p_user uuid)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare saved public.premium_orders; qris public.premium_qris_settings;
begin
 select * into qris from public.premium_qris_settings where id=1;
 if qris.id is null then raise exception 'Premium QRIS is not configured' using errcode='PT409'; end if;
 update public.premium_orders set qr_image=qris.image,qr_expires_at=now()+interval '24 hours',status='awaiting_payment',updated_at=now()
 where id=p_order and user_id=p_user and status='awaiting_qr' returning * into saved;
 if saved.id is null then raise exception 'Premium order cannot be prepared' using errcode='PT409'; end if;
 return next saved;
end; $$;
revoke all on function public.prepare_premium_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_premium_order(uuid,uuid) to service_role;

create function public.remove_premium_qris()
returns void language sql security invoker set search_path='' as $$
 delete from public.premium_qris_settings where id=1;
$$;
revoke all on function public.remove_premium_qris() from public,anon,authenticated;
grant execute on function public.remove_premium_qris() to service_role;

notify pgrst, 'reload schema';
commit;
