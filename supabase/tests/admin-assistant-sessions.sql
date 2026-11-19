begin;

insert into auth.users (id, email) values
  ('11111111-7777-4777-8777-111111111111','assistant-history-1@example.test'),
  ('22222222-7777-4777-8777-222222222222','assistant-history-2@example.test');

do $$
declare
  owner_id uuid := '11111111-7777-4777-8777-111111111111';
  other_id uuid := '22222222-7777-4777-8777-222222222222';
  session_id uuid;
  next_revision integer;
  current_scope text := repeat('a', 64);
  turn jsonb := '{"id":"11111111-8888-4888-8888-111111111111","user":{"text":"Halo"},"reply":{"text":"Halo kembali"}}';
begin
  if has_table_privilege('authenticated','public.admin_assistant_sessions','select')
    or has_table_privilege('authenticated','public.admin_assistant_memory','select')
    or has_function_privilege('anon','public.append_admin_assistant_turn(uuid,text,uuid,integer,text,jsonb)','execute') then
    raise exception 'assistant conversation or memory is exposed';
  end if;
  insert into public.admin_assistant_sessions(actor_id, access_scope)
    values (owner_id,current_scope) returning id into session_id;
  insert into public.admin_assistant_memory (actor_id,note) values (owner_id,'Jawab singkat');
  perform * from public.append_admin_assistant_turn(other_id,current_scope,session_id,0,'Halo',turn);
  if found then raise exception 'another owner can append'; end if;
  perform * from public.append_admin_assistant_turn(owner_id,repeat('b',64),session_id,0,'Halo',turn);
  if found then raise exception 'a different permission scope can append'; end if;
  select revision into next_revision from public.append_admin_assistant_turn(owner_id,current_scope,session_id,0,'Halo',turn);
  if next_revision is distinct from 1 then raise exception 'owned session did not append'; end if;
  perform * from public.append_admin_assistant_turn(owner_id,current_scope,session_id,0,'Halo',turn);
  if found then raise exception 'a stale revision can append'; end if;
  if (select turns from public.admin_assistant_sessions where id=session_id) <> jsonb_build_array(turn)
    or (select title from public.admin_assistant_sessions where id=session_id) <> 'Halo' then
    raise exception 'saved turn or title is invalid';
  end if;
  delete from public.admin_assistant_sessions where id=session_id;
  if not exists (select 1 from public.admin_assistant_memory where actor_id=owner_id) then
    raise exception 'deleting a session removed the owner preference';
  end if;
end;
$$;

rollback;
