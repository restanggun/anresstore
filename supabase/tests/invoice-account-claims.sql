begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-2222-4222-8222-000000000001','invoice-owner@example.com',now()),
 ('aaaaaaaa-2222-4222-8222-000000000002','other-owner@example.com',now()),
 ('aaaaaaaa-2222-4222-8222-000000000003','unverified@example.com',null);
do $$
declare a uuid:='aaaaaaaa-2222-4222-8222-000000000001'; b uuid:='aaaaaaaa-2222-4222-8222-000000000002';
 c uuid:='aaaaaaaa-2222-4222-8222-000000000003'; pid uuid; p jsonb; result jsonb; original_number text; i integer;
 challenge uuid:='dddddddd-2222-4222-8222-000000000001';
begin
 for i in 1..5 loop
  pid:=('eeeeeeee-2222-4222-8222-'||lpad(i::text,12,'0'))::uuid;
  p:=jsonb_build_object('id',pid,'payment_mode',case when i=4 then 'sandbox' else 'live' end,'access_hash',repeat('a',64),'request_hash',repeat('b',64),'source','game','provider_code','CLAIM-SKU','product_name','Invoice claim test','target','123','amount',2100,'method','QRIS','guest_session_hash',case when i=3 then repeat('d',64) else repeat('c',64) end,'checkout_hash',lpad(i::text,64,'1'),'customer_email',case when i=2 then 'other-owner@example.com' when i=5 then 'unverified@example.com' else 'invoice-owner@example.com' end,'fulfillment_mode','manual');
  perform public.reserve_payment(p);
 end loop;
 pid:='eeeeeeee-2222-4222-8222-000000000001';select invoice_number into original_number from public.payments where id=pid;
 if public.attach_guest_invoices(a,repeat('e',64),'invoice-owner@example.com','live')<>0 then raise exception 'Wrong cookie claimed'; end if;
 if public.attach_guest_invoices(c,repeat('c',64),'unverified@example.com','live')<>0 then raise exception 'Unverified email claimed'; end if;
 if public.attach_guest_invoices(a,repeat('c',64),'other-owner@example.com','live')<>0 then raise exception 'Client email forged'; end if;
 if public.attach_guest_invoices(a,repeat('c',64),'invoice-owner@example.com','live')<>1 then raise exception 'Expected one matching invoice'; end if;
 if public.attach_guest_invoices(a,repeat('c',64),'invoice-owner@example.com','live')<>0 then raise exception 'Claim replay changed ownership'; end if;
 if (select claimed_user_id from public.payments where id=pid)<>a or (select invoice_number from public.payments where id=pid)<>original_number then raise exception 'Claim identity or invoice changed'; end if;
 if (select owner_user_id from public.payments where id=pid) is not null or (select guest_session_hash from public.payments where id=pid)<>repeat('c',64) then raise exception 'Original guest snapshot changed'; end if;
 if (select user_id from public.live_transactions where id=pid)<>a then raise exception 'Claim not projected to account'; end if;
 if (select count(*) from public.invoice_claim_events where payment_id=pid)<>1 then raise exception 'Claim audit duplicated'; end if;
 begin
  update public.payments set claimed_user_id=b where id=pid;
  raise exception 'Claim was transferable';
 exception when check_violation then null; end;
 -- Account checkout must reuse a pending guest intent after linking, rather than charge twice.
 p:=jsonb_build_object('id','ffffffff-2222-4222-8222-000000000001','payment_mode','live','access_hash',repeat('a',64),'request_hash',repeat('b',64),'source','game','provider_code','CLAIM-SKU','product_name','Invoice claim test','target','123','amount',2100,'method','QRIS','owner_user_id',a,'checkout_hash',lpad('1',64,'1'),'customer_email','invoice-owner@example.com','fulfillment_mode','manual');
 result:=public.reserve_payment(p);
 if (result->'payment'->>'id')::uuid<>pid or (result->>'claimed')::boolean then raise exception 'Linking created a second intent'; end if;
 -- Different browser: proof must belong to both the challenge account and the checkout email.
 pid:='eeeeeeee-2222-4222-8222-000000000003';
 perform public.start_invoice_recovery(challenge,a,(select invoice_number from public.payments where id=pid),'invoice-owner@example.com','live');
 if public.consume_invoice_recovery_attempt(challenge,b) then raise exception 'Another account consumed challenge'; end if;
 if public.complete_invoice_recovery(challenge,a,'invoice-owner@example.com') is not null then raise exception 'No verified attempt accepted'; end if;
 if not public.consume_invoice_recovery_attempt(challenge,a) then raise exception 'Valid recovery attempt rejected'; end if;
 if public.complete_invoice_recovery(challenge,a,'other-owner@example.com') is not null then raise exception 'Wrong email completed claim'; end if;
 if public.complete_invoice_recovery(challenge,a,'invoice-owner@example.com') is null then raise exception 'Email proof failed'; end if;
 if public.complete_invoice_recovery(challenge,a,'invoice-owner@example.com') is not null then raise exception 'Consumed recovery reused'; end if;
 -- Existing invoice with another checkout email and a nonexistent invoice both create inert challenges.
 challenge:='dddddddd-2222-4222-8222-000000000002';
 perform public.start_invoice_recovery(challenge,a,(select invoice_number from public.payments where id='eeeeeeee-2222-4222-8222-000000000002'),'invoice-owner@example.com','live');
 if (select payment_id from public.invoice_recovery_challenges where id=challenge) is not null then raise exception 'Cross-email invoice recovery exposed'; end if;
 for i in 1..5 loop if not public.consume_invoice_recovery_attempt(challenge,a) then raise exception 'Attempt budget changed'; end if; end loop;
 if public.consume_invoice_recovery_attempt(challenge,a) then raise exception 'Sixth guess allowed'; end if;
 if public.complete_invoice_recovery(challenge,a,'invoice-owner@example.com') is not null then raise exception 'Dummy challenge granted invoice'; end if;
 challenge:='dddddddd-2222-4222-8222-000000000003';
 perform public.start_invoice_recovery(challenge,a,'ARNS-261115-00000000000000','invoice-owner@example.com','live');
 update public.invoice_recovery_challenges set expires_at=now()-interval '1 second' where id=challenge;
 if public.consume_invoice_recovery_attempt(challenge,a) then raise exception 'Expired challenge accepted'; end if;
 if has_function_privilege('authenticated','public.attach_guest_invoices(uuid,text,text,text)','execute') or has_function_privilege('anon','public.complete_invoice_recovery(uuid,uuid,text)','execute') or has_table_privilege('authenticated','public.invoice_recovery_challenges','select') then raise exception 'Private recovery privileges exposed'; end if;
end; $$;
rollback;
