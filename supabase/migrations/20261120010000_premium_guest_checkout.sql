begin;
alter table public.premium_orders alter column user_id drop not null;
alter table public.premium_orders add column customer_email text check(char_length(customer_email) between 3 and 254), add column customer_phone text check(customer_phone is null or char_length(customer_phone)<=16), add column guest_session_hash text check(guest_session_hash is null or guest_session_hash ~ '^[a-f0-9]{64}$');
alter table public.premium_orders add constraint premium_orders_identity_check check ((user_id is not null and guest_session_hash is null) or (user_id is null and guest_session_hash is not null));
create index premium_orders_guest_idx on public.premium_orders(guest_session_hash,created_at desc) where guest_session_hash is not null;

create or replace function public.reserve_premium_order(p_id uuid,p_user uuid,p_guest_hash text,p_email text,p_phone text,p_product uuid,p_amount bigint,p_rule_updated_at timestamptz)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare item public.managed_products; rule public.premium_product_rules; current_order public.premium_orders;
begin
 if (p_user is null and (p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$')) or (p_user is not null and p_guest_hash is not null)
   or p_email is null or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(p_email)>254
   or (p_phone is not null and p_phone !~ '^\+?[0-9]{8,15}$') then raise exception 'Customer contact invalid' using errcode='PT400'; end if;
 select * into item from public.managed_products where id=p_product and category='apps' and provider='manual' and active and deleted_at is null for share;
 select * into rule from public.premium_product_rules where product_id=p_product for share;
 if item.id is null or rule.product_id is null or item.price<>p_amount or rule.updated_at is distinct from p_rule_updated_at then raise exception 'Premium product unavailable or terms changed' using errcode='PT409'; end if;
 insert into public.premium_orders(id,user_id,guest_session_hash,customer_email,customer_phone,product_id,product_name,access_type,duration_days,guarantee_days,guarantee_terms,amount)
 values(p_id,p_user,p_guest_hash,lower(btrim(p_email)),p_phone,p_product,item.product||' - '||item.name,rule.access_type,rule.duration_days,rule.guarantee_days,rule.guarantee_terms,item.price)
 on conflict(id) do nothing;
 select * into current_order from public.premium_orders where id=p_id;
 if current_order.user_id is distinct from p_user or current_order.guest_session_hash is distinct from p_guest_hash or current_order.product_id<>p_product or current_order.amount<>p_amount then raise exception 'Premium order conflict' using errcode='PT409'; end if;
 return next current_order;
end; $$;
revoke all on function public.reserve_premium_order(uuid,uuid,text,text,text,uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_premium_order(uuid,uuid,text,text,text,uuid,bigint,timestamptz) to service_role;

create or replace function public.prepare_premium_order(p_order uuid,p_user uuid,p_guest_hash text,p_qr_image text)
returns setof public.premium_orders language plpgsql security invoker set search_path='' as $$
declare saved public.premium_orders;
begin
 if p_qr_image is null or char_length(p_qr_image)>180000 then raise exception 'Generated QR image is invalid' using errcode='PT400'; end if;
 update public.premium_orders set qr_image=p_qr_image,qr_expires_at=now()+interval '24 hours',status='awaiting_payment',updated_at=now()
 where id=p_order and ((p_user is not null and user_id=p_user) or (p_user is null and guest_session_hash=p_guest_hash)) and status='awaiting_qr' returning * into saved;
 if saved.id is null then raise exception 'Premium order cannot be prepared' using errcode='PT409'; end if;
 return next saved;
end; $$;
revoke all on function public.prepare_premium_order(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_premium_order(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
