begin;
insert into auth.users(id,email) values('dddddddd-0000-4000-8000-000000000001','delivery@example.com');
do $$
declare room uuid:='eeeeeeee-0000-4000-8000-000000000001'; person uuid:='dddddddd-0000-4000-8000-000000000001'; n bigint; unread bigint; job public.support_email_outbox; token uuid;
begin
 perform public.create_support_ticket(room,person,'Delivery test','Initial question');
 if (select count(*) from public.support_email_outbox where conversation_id=room)<>1 then raise exception 'New ticket email missing'; end if;
 select new_count into n from public.support_ticket_notifications();if n<1 then raise exception 'New ticket count missing'; end if;
 update public.support_conversations set status='in_progress',customer_read_at=now()-interval '1 hour',staff_read_at=now()-interval '1 hour' where id=room;
 perform public.append_support_message(gen_random_uuid(),room,person,'staff','CS reply');
 select unread_count into unread from public.support_customer_notifications(person);if unread<>1 then raise exception 'Customer unread missing'; end if;
 perform public.append_support_message(gen_random_uuid(),room,person,'customer','Customer reply');
 select unread_count into unread from public.support_ticket_notifications();if unread<1 then raise exception 'Staff unread missing'; end if;
 if (select count(*) from public.support_email_outbox where conversation_id=room)<>2 then raise exception 'Chat unexpectedly queued email'; end if;
 update public.support_conversations set status='in_progress' where id=room;
 if (select count(*) from public.support_email_outbox where conversation_id=room)<>2 then raise exception 'Duplicate status email'; end if;
 update public.support_conversations set status='rejected',rejection_reason='Duplicate ticket' where id=room;
 update public.support_conversations set status='closed' where id=room;
 if (select count(*) from public.support_email_outbox where conversation_id=room)<>4 then raise exception 'Terminal status emails missing'; end if;
 select * into job from public.claim_support_emails() where conversation_id=room limit 1;
 if job.id is null then raise exception 'Email not claimed'; end if;
 if exists(select 1 from public.claim_support_emails() where conversation_id=room) then raise exception 'Active email lease claimed twice'; end if;
 if exists(select 1 from public.finish_support_email(job.id,gen_random_uuid(),true,'fake',null)) then raise exception 'Stale claim acknowledged'; end if;
 perform public.finish_support_email(job.id,job.claim_token,true,'smtp-test',null);
 if (select status from public.support_email_outbox where id=job.id)<>'sent' then raise exception 'Email acknowledgement failed'; end if;
 if has_table_privilege('authenticated','public.support_email_outbox','select') or has_function_privilege('anon','public.support_customer_notifications(uuid)','execute') then raise exception 'Notification data exposed'; end if;
end; $$;
set local role service_role;
do $$
begin
 insert into public.admin_audit_log(actor_id,action,target) values('dddddddd-0000-4000-8000-000000000001','support.test','rollback-only');
 if has_table_privilege('service_role','public.admin_audit_log','update') then raise exception 'Audit must remain append only'; end if;
 begin
  insert into public.admin_audit_log(actor_id,action,target) values('dddddddd-0000-4000-8000-000000000001','support.test','rollback-only') on conflict(id) do update set target=excluded.target;
  raise exception 'Audit upsert unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
