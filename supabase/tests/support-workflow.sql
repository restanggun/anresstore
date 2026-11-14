begin;
insert into auth.users(id,email) values('aaaaaaaa-0000-4000-8000-000000000001','support-customer@example.com'),('aaaaaaaa-0000-4000-8000-000000000002','support-staff@example.com');
do $$
declare customer uuid:='aaaaaaaa-0000-4000-8000-000000000001'; staff uuid:='aaaaaaaa-0000-4000-8000-000000000002'; ticket uuid:='bbbbbbbb-0000-4000-8000-000000000001';
begin
 perform public.create_support_ticket(ticket,customer,'Bantuan pesanan','Riwayat AI dari customer');
 perform public.create_support_ticket(ticket,customer,'Bantuan pesanan','Riwayat AI dari customer');
 if (select count(*) from public.support_conversations where id=ticket)<>1 or (select count(*) from public.support_messages where conversation_id=ticket)<>1 then raise exception 'Duplicate ticket or context'; end if;
 if (select status from public.support_conversations where id=ticket)<>'new' then raise exception 'Ticket not waiting'; end if;
 begin
  perform public.append_support_message(gen_random_uuid(),ticket,staff,'staff','Balasan sebelum menerima');
  raise exception 'Staff replied before acceptance';
 exception when raise_exception then if SQLERRM='Staff replied before acceptance' then raise; end if; end;
 begin
  perform public.append_support_message(gen_random_uuid(),ticket,staff,'customer','Akun lain');
  raise exception 'Cross-customer message allowed';
 exception when raise_exception then if SQLERRM='Cross-customer message allowed' then raise; end if; end;
 update public.support_conversations set status='in_progress' where id=ticket;
 perform public.append_support_message('cccccccc-0000-4000-8000-000000000001',ticket,staff,'staff','Halo, saya bantu');
 perform public.append_support_message('cccccccc-0000-4000-8000-000000000001',ticket,staff,'staff','Halo, saya bantu');
 perform public.append_support_message(gen_random_uuid(),ticket,customer,'customer','Terima kasih');
 if (select count(*) from public.support_messages where conversation_id=ticket)<>3 then raise exception 'Reply idempotency failed'; end if;
 update public.support_conversations set status='rejected',rejection_reason='Permintaan duplikat' where id=ticket;
 begin
  perform public.append_support_message(gen_random_uuid(),ticket,customer,'customer','Sesudah ditolak');
  raise exception 'Rejected ticket accepted reply';
 exception when raise_exception then if SQLERRM='Rejected ticket accepted reply' then raise; end if; end;
 update public.support_conversations set status='closed' where id=ticket;
 begin
  perform public.append_support_message(gen_random_uuid(),ticket,staff,'staff','Sesudah ditutup');
  raise exception 'Closed ticket accepted reply';
 exception when raise_exception then if SQLERRM='Closed ticket accepted reply' then raise; end if; end;
 if has_table_privilege('authenticated','public.support_messages','select') or has_function_privilege('anon','public.create_support_ticket(uuid,uuid,text,text)','execute') then raise exception 'Private support exposed'; end if;
end; $$;
rollback;
