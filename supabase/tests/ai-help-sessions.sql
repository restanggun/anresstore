begin;
insert into auth.users(id,email) values('aaaaaaaa-0000-4000-8000-000000000011','ai-customer@example.com');
do $$
declare customer uuid:='aaaaaaaa-0000-4000-8000-000000000011'; session uuid:='bbbbbbbb-0000-4000-8000-000000000011'; turn uuid:='cccccccc-0000-4000-8000-000000000011';
 guest text:=repeat('a',64); account text:=repeat('b',64); answer text:=repeat('Jawaban lengkap. ',500); room public.ai_help_sessions;
begin
 perform public.create_ai_help_session(session,guest,null);
 perform public.create_ai_help_session(session,guest,null);
 if (select count(*) from public.ai_help_sessions where id=session)<>1 then raise exception 'Duplicate session'; end if;
 begin
  perform public.create_ai_help_session(session,account,customer);
  raise exception 'Ownership overwritten';
 exception when raise_exception then if SQLERRM='Ownership overwritten' then raise; end if; end;
 perform public.append_ai_help_turn(session,guest,0,turn,'Bagaimana checkout?',answer);
 perform public.append_ai_help_turn(session,guest,0,turn,'Bagaimana checkout?',answer);
 if (select jsonb_array_length(messages) from public.ai_help_sessions where id=session)<>2 then raise exception 'Duplicate turn'; end if;
 begin
  perform public.append_ai_help_turn(session,guest,0,gen_random_uuid(),'Stale version','Jawaban');
  raise exception 'Concurrent turn overwrote history';
 exception when raise_exception then if SQLERRM='Concurrent turn overwrote history' then raise; end if; end;
 begin
  perform public.append_ai_help_turn(session,account,2,gen_random_uuid(),'Other owner','Jawaban');
  raise exception 'Other owner wrote message';
 exception when raise_exception then if SQLERRM='Other owner wrote message' then raise; end if; end;
 perform public.convert_ai_help_session(session,guest,customer,account);
 perform public.convert_ai_help_session(session,account,customer,account);
 if (select count(*) from public.support_conversations where id=session)<>1 then raise exception 'Duplicate conversion'; end if;
 if (select status from public.support_conversations where id=session)<>'new' then raise exception 'CS accepted prematurely'; end if;
 if (select string_agg(body,'' order by created_at,id) from public.support_messages where conversation_id=session and author_role='ai')<>answer then raise exception 'AI transcript truncated'; end if;
 if (select body from public.support_messages where conversation_id=session and author_role='customer')<>'Bagaimana checkout?' then raise exception 'Question lost'; end if;
 select * into room from public.ai_help_sessions where id=session;
 if room.owner_key<>account or room.user_id<>customer or room.ticket_id<>session then raise exception 'Account handoff lost'; end if;
 begin
  perform public.append_ai_help_turn(session,account,2,gen_random_uuid(),'After handoff','Jawaban');
  raise exception 'AI continued after conversion';
 exception when raise_exception then if SQLERRM='AI continued after conversion' then raise; end if; end;
 if has_table_privilege('authenticated','public.ai_help_sessions','select') or has_function_privilege('anon','public.convert_ai_help_session(uuid,text,uuid,text)','execute') then raise exception 'Private AI history exposed'; end if;
end; $$;
rollback;
