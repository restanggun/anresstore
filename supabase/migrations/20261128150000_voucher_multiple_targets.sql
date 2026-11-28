begin;

create function public.voucher_targets_valid(p_targets jsonb,p_category text,p_kind text)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_targets) is distinct from 'array' then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_targets) as targets(target)
    where jsonb_typeof(target) is distinct from 'object'
      or target->>'category' is null
      or target->>'category' not in ('game','prepaid','apps','social','tasks')
      or (p_category is not null and target->>'category' is distinct from p_category)
      or jsonb_typeof(target->'product_slug') is distinct from 'string'
      or length(target->>'product_slug')>100
      or target->>'product_slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or not (target ? 'variant_code')
      or (jsonb_typeof(target->'variant_code') is distinct from 'null' and (
        jsonb_typeof(target->'variant_code') is distinct from 'string'
        or target->>'variant_code' !~ '^[A-Za-z0-9._-]{1,100}$'
      ))
      or (p_kind='gift' and (target->>'variant_code' is null or target->>'category' not in ('game','prepaid','apps')))
  );
end; $$;
revoke all on function public.voucher_targets_valid(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.voucher_targets_valid(jsonb,text,text) to service_role;

alter table public.vouchers
  add column targets jsonb not null default '[]',
  drop constraint vouchers_check5,
  add constraint vouchers_targets_valid check (public.voucher_targets_valid(targets,category,kind)),
  add constraint vouchers_target_mode check (targets='[]' or (product_slug is null and variant_code is null)),
  add constraint vouchers_gift_target check (kind<>'gift' or (
    value=1 and discount_cap is not null and account_limit is not null and
    (targets<>'[]' or (category in ('game','prepaid','apps') and variant_code is not null))
  ));

create or replace function public.voucher_offer(p_voucher jsonb,p_context jsonb,p_lock boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.vouchers; actor uuid := (p_context->>'user_id')::uuid;
  base integer := (p_context->>'base_amount')::integer; used_count bigint; actor_count bigint;
  discount integer; failure constant text := 'Voucher tidak tersedia untuk pesanan ini';
begin
  if p_voucher->>'code' is not null then
    select * into v from public.vouchers where code=p_voucher->>'code';
  else
    select * into v from public.vouchers where id=(p_voucher->>'id')::uuid;
  end if;
  if v.id is null then raise exception '%',failure using errcode='PT409'; end if;

  -- A quote does not hold stock. All reservations of this campaign use the
  -- same row lock, so concurrent checkouts cannot overspend the quota.
  if p_lock then
    select * into v from public.vouchers where id=v.id for update;
  end if;
  if v.id is null or (p_voucher->>'code' is not null and v.code is distinct from p_voucher->>'code')
    or p_context->>'mode' is distinct from 'live'
    or not v.active or clock_timestamp()<v.starts_at or clock_timestamp()>=v.ends_at
    or base is null or base not between greatest(1,v.minimum_amount) and 100000000
    or (v.category is not null and v.category is distinct from p_context->>'source')
    or (v.product_slug is not null and v.product_slug is distinct from p_context->>'product_slug')
    or (v.variant_code is not null and v.variant_code is distinct from p_context->>'code')
    or (v.targets<>'[]' and not exists (
      select 1 from jsonb_array_elements(v.targets) as targets(target)
      where target->>'category'=p_context->>'source'
        and target->>'product_slug'=p_context->>'product_slug'
        and (target->>'variant_code' is null or target->>'variant_code'=p_context->>'code')
    ))
    or (not v.allow_promotion and coalesce((p_context->>'promoted')::boolean,false))
    or (v.account_limit is not null and actor is null)
    or (p_voucher->>'id' is not null and not exists (
      select 1 from public.voucher_accounts a where a.voucher_id=v.id and a.user_id=actor and a.active
    )) then raise exception '%',failure using errcode='PT409'; end if;

  select count(*), count(*) filter(where user_id=actor) into used_count,actor_count
  from public.voucher_usage where voucher_id=v.id and state<>'released';
  if used_count>=v.total_limit or actor_count>=v.account_limit then
    raise exception '%',failure using errcode='PT409';
  end if;

  if v.kind='gift' then
    if base>v.discount_cap then
      raise exception '%',failure using errcode='PT409';
    end if;
    discount := base;
  elsif v.kind='fixed' then
    discount := least(v.value,base-1);
  else
    discount := least((base::bigint*v.value/100)::integer,coalesce(v.discount_cap,base),base-1);
  end if;
  if discount<1 then raise exception '%',failure using errcode='PT409'; end if;
  return jsonb_build_object('id',v.id,'name',v.name,'kind',v.kind,'baseAmount',base,'discount',discount,
    'amount',base-discount,'endsAt',v.ends_at);
end; $$;

create or replace function public.review_referral(p_referral uuid,p_approve boolean,p_actor uuid,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.referral_attributions; cfg jsonb; ref_template public.vouchers; friend_template public.vouchers; ref_voucher uuid; friend_voucher uuid;
begin
 select * into a from public.referral_attributions where id=p_referral for update;
 if a.id is null or a.status<>'qualified' then raise exception 'Referral is not awaiting review' using errcode='40001'; end if;
 if not p_approve then
  update public.referral_attributions set status='rejected',rejection_note=left(btrim(coalesce(p_note,'')),500),reviewed_at=now() where id=a.id;
  return jsonb_build_object('status','rejected');
 end if;
 select config into cfg from public.campaign_settings where id=1 and enabled;
 if cfg is null then raise exception 'Campaign is disabled' using errcode='55000'; end if;
 select * into ref_template from public.vouchers where id=(cfg->>'referrerVoucherTemplate')::uuid and active and code is null and account_limit is not null and ends_at>now() for update;
 select * into friend_template from public.vouchers where id=(cfg->>'friendVoucherTemplate')::uuid and active and code is null and account_limit is not null and ends_at>now() for update;
 if ref_template.id is null or friend_template.id is null then raise exception 'Reward voucher templates are unavailable' using errcode='55000'; end if;
 insert into public.vouchers(name,code,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,targets,starts_at,ends_at,total_limit,account_limit,allow_promotion,active)
 values(left(ref_template.name||' - Referral',100),null,ref_template.kind,ref_template.value,ref_template.discount_cap,ref_template.minimum_amount,ref_template.category,ref_template.product_slug,ref_template.variant_code,ref_template.targets,greatest(ref_template.starts_at,now()),ref_template.ends_at,1,1,ref_template.allow_promotion,true) returning id into ref_voucher;
 insert into public.voucher_accounts(voucher_id,user_id) values(ref_voucher,a.referrer_user_id);
 insert into public.vouchers(name,code,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,targets,starts_at,ends_at,total_limit,account_limit,allow_promotion,active)
 values(left(friend_template.name||' - Referral',100),null,friend_template.kind,friend_template.value,friend_template.discount_cap,friend_template.minimum_amount,friend_template.category,friend_template.product_slug,friend_template.variant_code,friend_template.targets,greatest(friend_template.starts_at,now()),friend_template.ends_at,1,1,friend_template.allow_promotion,true) returning id into friend_voucher;
 insert into public.voucher_accounts(voucher_id,user_id) values(friend_voucher,a.referred_user_id);
 update public.referral_attributions set status='rewarded',referrer_voucher_id=ref_voucher,friend_voucher_id=friend_voucher,reviewed_at=now() where id=a.id;
 return jsonb_build_object('status','rewarded');
end; $$;

notify pgrst,'reload schema';
commit;
