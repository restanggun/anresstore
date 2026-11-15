begin;
insert into auth.users(id,email) values('aaaaaaaa-1111-4111-8111-111111111111','refund-owner@example.com'),('bbbbbbbb-1111-4111-8111-111111111111','refund-admin@example.com');
do $$
declare customer uuid:='aaaaaaaa-1111-4111-8111-111111111111'; actor uuid:='bbbbbbbb-1111-4111-8111-111111111111';
 pid uuid; ticket public.support_conversations; repeated public.support_conversations; i integer; total bigint; p jsonb;
begin
 for i in 1..3 loop
  pid:=('eeeeeeee-1111-4111-8111-'||lpad(i::text,12,'0'))::uuid; total:=case when i=1 then 50000 else 50001 end;
  p:=jsonb_build_object('id',pid,'payment_mode',case when i=3 then 'sandbox' else 'live' end,'access_hash',repeat('a',64),'request_hash',repeat('b',64),'source','game','provider_code','SKU','product_name','Refund test','target','123','amount',total,'method','BRIVA','owner_user_id',customer,'checkout_hash',lpad(i::text,64,'1'),'provider_cost',1000,'fulfillment_mode','vipayment');
  perform public.reserve_payment(p);
  update public.payments set status='paid',reference='REFUND-TEST-'||i,revision=revision+1 where id=pid;
  update public.live_transactions set fulfillment_status='failed' where id=pid;
  if i=3 then
   begin
    perform public.request_payment_refund(pid,customer,null,'Produk belum diterima','BCA','Pemilik rekening','1234567890');
    raise exception 'Sandbox money refund accepted';
   exception when check_violation then null; end;
   continue;
  end if;
  begin
   perform public.request_payment_refund(pid,actor,null,'Produk belum diterima','BCA','Pemilik rekening','1234567890');
   raise exception 'Other owner refund accepted';
  exception when insufficient_privilege then null; end;
  select * into ticket from public.request_payment_refund(pid,customer,null,'Produk belum diterima','BCA','Pemilik rekening','1234567890');
  if ticket.refund_amount<>total or ticket.refund_requires_admin<>(total>50000) then raise exception 'Server amount or admin threshold incorrect'; end if;
  select * into repeated from public.request_payment_refund(pid,customer,null,'Produk belum diterima','BCA','Pemilik rekening','1234567890');
  if repeated.id<>ticket.id or (select count(*) from public.support_messages where conversation_id=ticket.id)<>1 then raise exception 'Duplicate refund ticket or message'; end if;
  if not (select review_required from public.live_transactions where id=pid) then raise exception 'Refund did not hold fulfillment'; end if;
  update public.support_conversations set status='in_progress' where id=ticket.id;
  begin
   update public.live_transactions set fulfillment_status='unknown' where id=pid;
  begin
   perform public.review_payment_refund(ticket.id,actor,'completed','Transfer sudah selesai','BANK-12345');
   raise exception 'Uncertain supplier refunded';
  exception when raise_exception then if SQLERRM='Uncertain supplier refunded' then raise; end if; end;
  update public.live_transactions set fulfillment_status='failed' where id=pid;
  perform public.review_payment_refund(ticket.id,actor,'completed','Transfer sudah selesai','BANK-12345');
   raise exception 'Refund completed without review';
  exception when raise_exception then if SQLERRM='Refund completed without review' then raise; end if; end;
  perform public.review_payment_refund(ticket.id,actor,'in_review','Admin sedang memeriksa pesanan',null);
  begin
   perform public.review_payment_refund(ticket.id,actor,'completed','Transfer sudah selesai',null);
   raise exception 'Refund completed without evidence';
  exception when raise_exception then if SQLERRM='Refund completed without evidence' then raise; end if; end;
  perform public.review_payment_refund(ticket.id,actor,'completed','Transfer sudah selesai','BANK-12345');
  perform public.review_payment_refund(ticket.id,actor,'completed','Transfer sudah selesai','BANK-12345');
  if (select count(*) from public.support_messages where conversation_id=ticket.id)<>3 then raise exception 'Refund completion replay duplicated message'; end if;
  if (select status from public.payments where id=pid)<>'paid' then raise exception 'Refund forged a Tripay state'; end if;
 end loop;
 pid:='eeeeeeee-1111-4111-8111-000000000004';
 p:=p||jsonb_build_object('id',pid,'owner_user_id',null,'guest_session_hash',repeat('c',64),'payment_mode','live','checkout_hash',repeat('d',64));
 perform public.reserve_payment(p);
 update public.payments set status='paid',reference='GUEST-REFUND',revision=revision+1 where id=pid;
 update public.live_transactions set fulfillment_status='failed' where id=pid;
 begin
  perform public.request_payment_refund(pid,actor,repeat('e',64),'Produk belum diterima','BCA','Pemilik rekening','1234567890');
  raise exception 'Wrong guest cookie accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.request_payment_refund(pid,actor,null,'Produk belum diterima','BCA','Pemilik rekening','1234567890');
  raise exception 'Missing guest cookie accepted';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('authenticated','public.request_payment_refund(uuid,uuid,text,text,text,text,text)','execute') or has_function_privilege('anon','public.review_payment_refund(uuid,uuid,text,text,text)','execute') then raise exception 'Refund RPC exposed'; end if;
end; $$;
rollback;
