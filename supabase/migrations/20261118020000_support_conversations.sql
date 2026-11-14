begin;
create table public.support_conversations (
 id uuid primary key,
 user_id uuid not null references public.users(id),
 subject text not null check (char_length(subject) between 3 and 160),
 status text not null default 'new' check (status in ('new','in_progress','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.support_messages (
 id uuid primary key,
 conversation_id uuid not null references public.support_conversations(id),
 author_id uuid not null references public.users(id),
 author_role text not null check (author_role in ('customer','staff')),
 body text not null check (char_length(body) between 1 and 3000),
 created_at timestamptz not null default now()
);
create index support_conversations_user_idx on public.support_conversations(user_id,created_at desc);
create index support_messages_conversation_idx on public.support_messages(conversation_id,created_at,id);
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_conversations, public.support_messages from public,anon,authenticated;
grant select,insert,update on public.support_conversations to service_role;
grant select,insert on public.support_messages to service_role;
-- Lock the room before inserting: closing and replying cannot race.
create function public.append_support_message(p_id uuid,p_room uuid,p_actor uuid,p_role text,p_body text)
returns setof public.support_messages language plpgsql security invoker set search_path='' as $$
declare room public.support_conversations;
begin
 select * into room from public.support_conversations where id=p_room for update;
 if not found or (p_role='customer' and room.user_id<>p_actor) then raise exception 'Room unavailable'; end if;
 if room.status='closed' then raise exception 'Room closed'; end if;
 if exists(select 1 from public.support_messages where id=p_id and (conversation_id<>p_room or author_id<>p_actor or body<>p_body or author_role<>p_role)) then raise exception 'Message conflict'; end if;
 insert into public.support_messages(id,conversation_id,author_id,author_role,body) values(p_id,p_room,p_actor,p_role,p_body) on conflict(id) do nothing;
 update public.support_conversations set updated_at=now(),status=case when p_role='staff' then 'in_progress' else status end where id=p_room;
 return query select * from public.support_messages where id=p_id;
end; $$;
revoke all on function public.append_support_message(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.append_support_message(uuid,uuid,uuid,text,text) to service_role;
commit;
