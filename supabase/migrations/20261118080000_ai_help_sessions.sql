begin;
create table public.ai_help_sessions (
 id uuid primary key,
 owner_key text not null check (owner_key ~ '^[a-f0-9]{64}$'),
 user_id uuid references public.users(id),
 subject text not null default 'Percakapan baru' check (char_length(subject) between 3 and 160),
 messages jsonb not null default '[]' check (jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=200),
 ticket_id uuid unique references public.support_conversations(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index ai_help_sessions_owner_idx on public.ai_help_sessions(owner_key,updated_at desc,id);
alter table public.ai_help_sessions enable row level security;
revoke all on public.ai_help_sessions from public,anon,authenticated;
grant select,insert,update on public.ai_help_sessions to service_role;

create function public.create_ai_help_session(p_id uuid,p_owner text,p_user uuid)
returns setof public.ai_help_sessions language plpgsql security invoker set search_path='' as $$
declare room public.ai_help_sessions;
begin
 insert into public.ai_help_sessions(id,owner_key,user_id) values(p_id,p_owner,p_user) on conflict(id) do nothing;
 select * into room from public.ai_help_sessions where id=p_id for update;
 if room.owner_key<>p_owner then raise exception 'Session conflict'; end if;
 return next room;
end; $$;

create function public.append_ai_help_turn(p_id uuid,p_owner text,p_version integer,p_turn uuid,p_question text,p_answer text)
returns setof public.ai_help_sessions language plpgsql security invoker set search_path='' as $$
declare room public.ai_help_sessions;
begin
 select * into room from public.ai_help_sessions where id=p_id and owner_key=p_owner for update;
 if not found then raise exception 'Session unavailable'; end if;
 if exists(select 1 from jsonb_array_elements(room.messages) m where m->>'id'=p_turn::text) then
  if not exists(select 1 from jsonb_array_elements(room.messages) m where m->>'id'=p_turn::text and m->>'content'=p_question) then raise exception 'Turn conflict'; end if;
  return next room; return;
 end if;
 if room.ticket_id is not null or jsonb_array_length(room.messages)<>p_version or p_version>=200 then raise exception 'Session changed'; end if;
 if p_question is null or char_length(trim(p_question)) not between 1 and 1500 or p_answer is null or char_length(trim(p_answer)) not between 1 and 16000 then raise exception 'Invalid turn'; end if;
 update public.ai_help_sessions set
  subject=case when p_version=0 then rpad(left(p_question,160),greatest(3,least(char_length(p_question),160)),'.') else subject end,
  messages=messages || jsonb_build_array(
   jsonb_build_object('id',p_turn,'role','user','content',p_question,'created_at',now()),
   jsonb_build_object('id',gen_random_uuid(),'role','assistant','content',p_answer,'created_at',now())),
  updated_at=now() where id=p_id returning * into room;
 return next room;
end; $$;

alter table public.support_messages drop constraint support_messages_author_role_check;
alter table public.support_messages add constraint support_messages_author_role_check check(author_role in ('customer','staff','ai'));

create function public.convert_ai_help_session(p_id uuid,p_owner text,p_user uuid,p_account_owner text)
returns setof public.ai_help_sessions language plpgsql security invoker set search_path='' as $$
declare room public.ai_help_sessions; entry jsonb; part integer; ordinal integer:=0;
begin
 select * into room from public.ai_help_sessions where id=p_id and owner_key=p_owner for update;
 if not found or p_user is null or (room.user_id is not null and room.user_id<>p_user) then raise exception 'Session unavailable'; end if;
 if room.ticket_id is not null then return next room; return; end if;
 -- The session and room share an ID. All messages and the handoff commit together.
 insert into public.support_conversations(id,user_id,subject) values(room.id,p_user,room.subject);
 for entry in select value from jsonb_array_elements(room.messages) loop
  for part in 0..((char_length(entry->>'content')-1)/3000) loop
   insert into public.support_messages(id,conversation_id,author_id,author_role,body,created_at)
   values(gen_random_uuid(),room.id,p_user,case when entry->>'role'='assistant' then 'ai' else 'customer' end,
    substring(entry->>'content' from part*3000+1 for 3000),room.created_at + ordinal*interval '1 microsecond');
   ordinal:=ordinal+1;
  end loop;
 end loop;
 update public.ai_help_sessions set ticket_id=id,user_id=p_user,owner_key=p_account_owner,updated_at=now() where id=p_id returning * into room;
 return next room;
end; $$;

revoke all on function public.create_ai_help_session(uuid,text,uuid), public.append_ai_help_turn(uuid,text,integer,uuid,text,text), public.convert_ai_help_session(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_ai_help_session(uuid,text,uuid), public.append_ai_help_turn(uuid,text,integer,uuid,text,text), public.convert_ai_help_session(uuid,text,uuid,text) to service_role;
commit;
