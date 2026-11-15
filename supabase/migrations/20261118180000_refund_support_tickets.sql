begin;
alter table public.support_conversations
 add column kind text not null default 'support' check(kind in ('support','refund')),
 add column payment_id uuid references public.payments(id),
 add column refund_amount bigint,
 add column refund_requires_admin boolean not null default false,
 add column refund_status text check(refund_status in ('requested','in_review','completed','rejected')),
 add column refund_resolution text check(char_length(refund_resolution)<=1000),
 add column refund_reference text check(char_length(refund_reference)<=160);
create unique index support_refund_payment_unique on public.support_conversations(payment_id) where kind='refund';
alter table public.support_conversations add constraint refund_ticket_metadata check (
 (kind='support' and payment_id is null and refund_status is null and refund_amount is null)
 or (kind='refund' and payment_id is not null and refund_status is not null and refund_amount is not null and refund_amount>0 and refund_requires_admin=(refund_amount>50000))
);
create function public.request_payment_refund(p_payment uuid,p_user uuid,p_guest_hash text,p_reason text,p_bank text,p_account_name text,p_account_number text)
returns setof public.support_conversations language plpgsql security invoker set search_path='' as $$
declare payment public.payments; delivery public.live_transactions; room public.support_conversations; total bigint; body text;
begin
 select * into payment from public.payments where id=p_payment for update;
 if not found or p_user is null or not coalesce((
   payment.owner_user_id=p_user or (payment.owner_user_id is null and payment.guest_session_hash=p_guest_hash and payment.created_at>=now()-interval '30 days')
 ),false) then raise exception 'Invoice unavailable' using errcode='42501'; end if;
 select * into room from public.support_conversations where payment_id=p_payment and kind='refund';
 if found then
  if room.user_id<>p_user then raise exception 'Ticket unavailable' using errcode='42501'; end if;
  return next room; return;
 end if;
 if payment.status<>'paid' or payment.payment_mode<>'live' then raise exception 'Refund requires a paid live invoice' using errcode='23514'; end if;
 select * into delivery from public.live_transactions where id=p_payment for update;
 if not found or delivery.fulfillment_status not in ('failed','unknown','manual_review','ready','not_ready') then
  raise exception 'Delivery must be checked before refund' using errcode='23514';
 end if;
 if p_reason is null or p_bank is null or p_account_name is null or p_account_number is null or char_length(btrim(p_reason)) not between 10 and 1500 or char_length(btrim(p_bank)) not between 2 and 80
 or char_length(btrim(p_account_name)) not between 2 and 100 or p_account_number !~ '^[0-9]{6,34}$' then
  raise exception 'Invalid refund details' using errcode='23514';
 end if;
 total := coalesce((payment.details->>'amount')::bigint,payment.amount);
 if total<payment.amount or total>100000000 then raise exception 'Invalid transaction amount'; end if;
 insert into public.support_conversations(id,user_id,subject,kind,payment_id,refund_amount,refund_requires_admin,refund_status)
 values(gen_random_uuid(),p_user,'Pengembalian dana - '||payment.invoice_number,'refund',p_payment,total,total>50000,'requested') returning * into room;
 body := 'Pengajuan pengembalian dana'||E'
Invoice: '||payment.invoice_number||E'
Nominal transaksi: Rp'||total::text
 ||E'
Status pengiriman: '||delivery.fulfillment_status||E'
Alasan: '||btrim(p_reason)
 ||E'
Bank / e-wallet: '||btrim(p_bank)||E'
Nama pemilik: '||btrim(p_account_name)||E'
Nomor rekening / e-wallet: '||p_account_number
 ||E'
Nominal dan kelayakan pengembalian harus diverifikasi admin. Penutupan tiket bukan bukti transfer.';
 insert into public.support_messages(id,conversation_id,author_id,author_role,body) values(gen_random_uuid(),room.id,p_user,'customer',body);
 -- Stop any not-yet-dispatched purchase while the refund is investigated.
 update public.live_transactions set review_required=true,updated_at=now() where id=p_payment;
 return next room;
end; $$;
revoke all on function public.request_payment_refund(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_payment_refund(uuid,uuid,text,text,text,text,text) to service_role;
create function public.review_payment_refund(p_room uuid,p_actor uuid,p_status text,p_resolution text,p_reference text)
returns setof public.support_conversations language plpgsql security invoker set search_path='' as $$
declare room public.support_conversations; payment public.payments;
begin
 select * into room from public.support_conversations where id=p_room and kind='refund' for update;
 if not found then raise exception 'Refund ticket unavailable'; end if;
 if room.status<>'in_progress' then raise exception 'Accept ticket before refund review'; end if;
 if p_status not in ('in_review','completed','rejected') or char_length(btrim(p_resolution)) not between 10 and 1000 then raise exception 'Invalid refund review'; end if;
 if room.refund_status=p_status then
  if room.refund_resolution is distinct from btrim(p_resolution) or room.refund_reference is distinct from nullif(btrim(p_reference),'') then raise exception 'Refund review conflict'; end if;
  return next room; return;
 end if;
 if room.refund_status in ('completed','rejected') or (p_status='completed' and room.refund_status<>'in_review') then raise exception 'Refund transition unavailable'; end if;
 if p_status='completed' then
  if char_length(btrim(coalesce(p_reference,''))) not between 6 and 160 then raise exception 'Transfer evidence required'; end if;
  select * into payment from public.payments where id=room.payment_id for update;
  if payment.payment_mode<>'live' or payment.status<>'paid' then raise exception 'Payment must be checked'; end if;
  if exists(select 1 from public.live_transactions where id=room.payment_id and (fulfillment_status not in ('failed','not_ready','ready','manual_review') or provider_reference is not null and fulfillment_status<>'failed')) then
   raise exception 'Confirm supplier outcome before refund';
  end if;
 end if;
 update public.support_conversations set refund_status=p_status,refund_resolution=btrim(p_resolution),refund_reference=nullif(btrim(p_reference),''),updated_at=now() where id=p_room returning * into room;
 insert into public.support_messages(id,conversation_id,author_id,author_role,body)
 values(gen_random_uuid(),p_room,p_actor,'staff','Pembaruan pengembalian dana: '||p_status||E'
'||btrim(p_resolution)||case when nullif(btrim(p_reference),'') is not null then E'
Referensi transfer: '||btrim(p_reference) else '' end);
 -- This records an admin attestation, never invents a Tripay REFUND event.
 return next room;
end; $$;
revoke all on function public.review_payment_refund(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.review_payment_refund(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
