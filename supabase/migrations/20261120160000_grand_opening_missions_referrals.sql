begin;
create table public.campaign_settings (
 id smallint primary key default 1 check(id=1), revision integer not null default 1,
 enabled boolean not null default false,
 config jsonb not null default '{"title":"Misi Grand Opening","description":"Selesaikan misi dan ajak teman berbelanja.","startsAt":null,"endsAt":null,"minReferralAmount":10000,"referrerVoucherTemplate":null,"friendVoucherTemplate":null,"missions":[{"id":"verified_email","title":"Verifikasi email","description":"Amankan akun dengan email terverifikasi."},{"id":"first_completed_order","title":"Selesaikan transaksi pertama","description":"Selesaikan satu transaksi grand opening."},{"id":"referral_rewarded","title":"Ajak teman berbelanja","description":"Teman menyelesaikan transaksi valid."}]}'::jsonb,
 updated_at timestamptz not null default now()
);
insert into public.campaign_settings(id) values(1) on conflict(id) do nothing;
create table public.referral_profiles(user_id uuid primary key references auth.users(id) on delete cascade,code text not null unique check(code ~ '^[A-F0-9]{16}$'),created_at timestamptz not null default now());
create table public.referral_attributions(
 id uuid primary key default gen_random_uuid(), referrer_user_id uuid not null references auth.users(id) on delete restrict,
 referred_user_id uuid not null unique references auth.users(id) on delete cascade, referral_code text not null,
 status text not null default 'pending_verification' check(status in ('pending_verification','active','qualified','rewarded','rejected')),
 qualifying_invoice_id uuid references public.invoices(id) on delete restrict,
 referrer_voucher_id uuid references public.vouchers(id) on delete restrict, friend_voucher_id uuid references public.vouchers(id) on delete restrict,
 rejection_note text check(rejection_note is null or char_length(rejection_note)<=500),
 created_at timestamptz not null default now(), activated_at timestamptz, qualified_at timestamptz, reviewed_at timestamptz
);
create index referral_attributions_review_queue on public.referral_attributions(status,created_at desc);
alter table public.campaign_settings enable row level security;
alter table public.referral_profiles enable row level security;
alter table public.referral_attributions enable row level security;
revoke all on public.campaign_settings,public.referral_profiles,public.referral_attributions from public,anon,authenticated;
grant select,insert,update on public.campaign_settings to service_role;
grant select,insert on public.referral_profiles to service_role;
grant select,insert,update on public.referral_attributions to service_role;

create or replace function public.capture_referral_attribution(p_user uuid,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare profile public.referral_profiles; actor auth.users; ref auth.users; campaign public.campaign_settings;
begin
 if p_user is null or p_code !~ '^[A-F0-9]{16}$' then return false; end if;
  select * into campaign from public.campaign_settings where id=1 and enabled;
  if campaign.id is null then return false; end if;
  if nullif(campaign.config->>'startsAt','') is not null and (campaign.config->>'startsAt')::timestamptz>now() then return false; end if;
  if nullif(campaign.config->>'endsAt','') is not null and (campaign.config->>'endsAt')::timestamptz<=now() then return false; end if;
 select * into actor from auth.users where id=p_user;
 select * into profile from public.referral_profiles where code=p_code;
 if actor.id is null or profile.user_id is null or profile.user_id=p_user then return false; end if;
 select * into ref from auth.users where id=profile.user_id;
 if lower(coalesce(actor.email,''))=lower(coalesce(ref.email,'')) or exists(select 1 from public.referral_attributions where referred_user_id=p_user) then return false; end if;
 insert into public.referral_attributions(referrer_user_id,referred_user_id,referral_code) values(profile.user_id,p_user,p_code) on conflict(referred_user_id) do nothing;
 return found;
end; $$;
create or replace function public.activate_referral_attribution(p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare verified timestamptz;
begin
 select email_confirmed_at into verified from auth.users where id=p_user;
 if verified is null then return false; end if;
 update public.referral_attributions set status='active',activated_at=now() where referred_user_id=p_user and status='pending_verification';
 return found;
end; $$;
create or replace function public.campaign_user_snapshot(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor auth.users; code text; referral_count integer; reward_count integer; qualified_count integer; first_order boolean; cfg jsonb;
begin
 select * into actor from auth.users where id=p_user;
 if actor.id is null or actor.email_confirmed_at is null then raise exception 'Verified account required' using errcode='42501'; end if;
 insert into public.referral_profiles(user_id,code) values(p_user,upper(left(replace(gen_random_uuid()::text,'-',''),16))) on conflict(user_id) do nothing;
 select p.code into code from public.referral_profiles p where p.user_id=p_user;
 select config into cfg from public.campaign_settings where id=1;
 select count(*)::integer into referral_count from public.referral_attributions where referrer_user_id=p_user and status in ('active','qualified','rewarded');
 select count(*)::integer into reward_count from public.referral_attributions where referrer_user_id=p_user and status='rewarded';
 select count(*)::integer into qualified_count from public.referral_attributions where referrer_user_id=p_user and status in ('qualified','rewarded');
 select exists(select 1 from public.invoices i where coalesce(i.owner_user_id,i.claimed_user_id)=p_user and i.payment_mode='live' and i.payment_status='paid' and i.fulfillment_status='completed' and i.source_method<>'VOUCHER' and i.amount>0) into first_order;
 return jsonb_build_object('enabled',(select enabled from public.campaign_settings where id=1),'title',cfg->>'title','description',cfg->>'description','startsAt',cfg->>'startsAt','endsAt',cfg->>'endsAt','referralCode',code,'referralCount',referral_count,'qualifiedReferralCount',qualified_count,'rewardCount',reward_count,'emailVerified',true,'firstCompletedOrder',first_order,'missions',coalesce(cfg->'missions','[]'::jsonb));
end; $$;
create or replace function public.qualify_referral(p_invoice uuid,p_minimum integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare order_row public.invoices; attribution public.referral_attributions; referred uuid;
begin
 select * into order_row from public.invoices where id=p_invoice for update;
 referred:=coalesce(order_row.owner_user_id,order_row.claimed_user_id);
 if order_row.id is null or order_row.payment_mode<>'live' or order_row.payment_status<>'paid' or order_row.fulfillment_status<>'completed' or order_row.source_method='VOUCHER' or order_row.amount<=0 or order_row.amount<p_minimum then return null; end if;
 select * into attribution from public.referral_attributions where referred_user_id=referred and status='active' for update;
 if attribution.id is null or attribution.referrer_user_id=referred then return null; end if;
 update public.referral_attributions set status='qualified',qualifying_invoice_id=p_invoice,qualified_at=now() where id=attribution.id;
 return attribution.id;
end; $$;
create or replace function public.capture_completed_referral() returns trigger
language plpgsql security definer set search_path='' as $$
declare campaign public.campaign_settings; minimum_amount integer;
begin
 if new.payment_mode<>'live' or new.payment_status<>'paid' or new.fulfillment_status<>'completed' or new.amount<=0 then return new; end if;
 select * into campaign from public.campaign_settings where id=1 and enabled;
 if campaign.id is null then return new; end if;
 if nullif(campaign.config->>'startsAt','') is not null and (campaign.config->>'startsAt')::timestamptz>now() then return new; end if;
 if nullif(campaign.config->>'endsAt','') is not null and (campaign.config->>'endsAt')::timestamptz<=now() then return new; end if;
 minimum_amount:=greatest(0,coalesce((campaign.config->>'minReferralAmount')::integer,0));
 perform public.qualify_referral(new.id,minimum_amount);
 return new;
end; $$;
drop trigger if exists capture_completed_referral on public.invoices;
create trigger capture_completed_referral after insert or update of payment_status,fulfillment_status,amount,source_method on public.invoices
for each row execute function public.capture_completed_referral();
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
 insert into public.vouchers(name,code,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,starts_at,ends_at,total_limit,account_limit,allow_promotion,active)
 values(left(ref_template.name||' - Referral',100),null,ref_template.kind,ref_template.value,ref_template.discount_cap,ref_template.minimum_amount,ref_template.category,ref_template.product_slug,ref_template.variant_code,greatest(ref_template.starts_at,now()),ref_template.ends_at,1,1,ref_template.allow_promotion,true) returning id into ref_voucher;
 insert into public.voucher_accounts(voucher_id,user_id) values(ref_voucher,a.referrer_user_id);
 insert into public.vouchers(name,code,kind,value,discount_cap,minimum_amount,category,product_slug,variant_code,starts_at,ends_at,total_limit,account_limit,allow_promotion,active)
 values(left(friend_template.name||' - Referral',100),null,friend_template.kind,friend_template.value,friend_template.discount_cap,friend_template.minimum_amount,friend_template.category,friend_template.product_slug,friend_template.variant_code,greatest(friend_template.starts_at,now()),friend_template.ends_at,1,1,friend_template.allow_promotion,true) returning id into friend_voucher;
 insert into public.voucher_accounts(voucher_id,user_id) values(friend_voucher,a.referred_user_id);
 update public.referral_attributions set status='rewarded',referrer_voucher_id=ref_voucher,friend_voucher_id=friend_voucher,reviewed_at=now() where id=a.id;
 return jsonb_build_object('status','rewarded');
end; $$;
revoke all on function public.capture_referral_attribution(uuid,text),public.activate_referral_attribution(uuid),public.campaign_user_snapshot(uuid),public.qualify_referral(uuid,integer),public.review_referral(uuid,boolean,uuid,text),public.capture_completed_referral() from public,anon,authenticated;
grant execute on function public.capture_referral_attribution(uuid,text),public.activate_referral_attribution(uuid),public.campaign_user_snapshot(uuid),public.qualify_referral(uuid,integer),public.review_referral(uuid,boolean,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
