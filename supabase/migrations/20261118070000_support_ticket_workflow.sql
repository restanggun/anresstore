begin;
alter table public.support_conversations drop constraint support_conversations_status_check;
alter table public.support_conversations add constraint support_conversations_status_check check(status in ('new','in_progress','rejected','closed'));
alter table public.support_conversations add column rejection_reason text check(char_length(rejection_reason) <= 500);

create function public.create_support_ticket(p_id uuid,p_user uuid,p_subject text,p_body text)
returns setof public.support_conversations language plpgsql security invoker set search_path='' as $$
declare room public.support_conversations;
begin
 insert into public.support_conversations(id,user_id,subject) values(p_id,p_user,p_subject) on conflict(id) do nothing;
 select * into room from public.support_conversations where id=p_id for update;
 if room.user_id<>p_user or room.subject<>p_subject then raise exception 'Ticket conflict'; end if;
 if p_body is not null and p_body<>'' then
  insert into public.support_messages(id,conversation_id,author_id,author_role,body)
  values(p_id,p_id,p_user,'customer',p_body) on conflict(id) do nothing;
 end if;
 return next room;
end; $$;
revoke all on function public.create_support_ticket(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_support_ticket(uuid,uuid,text,text) to service_role;

create or replace function public.append_support_message(p_id uuid,p_room uuid,p_actor uuid,p_role text,p_body text)
returns setof public.support_messages language plpgsql security invoker set search_path='' as $$
declare room public.support_conversations;
begin
 select * into room from public.support_conversations where id=p_room for update;
 if not found or p_role not in ('customer','staff') or (p_role='customer' and room.user_id<>p_actor) then raise exception 'Room unavailable'; end if;
 if room.status in ('closed','rejected') or (p_role='staff' and room.status<>'in_progress') then raise exception 'Room unavailable for replies'; end if;
 if exists(select 1 from public.support_messages where id=p_id and (conversation_id<>p_room or author_id<>p_actor or body<>p_body or author_role<>p_role)) then raise exception 'Message conflict'; end if;
 insert into public.support_messages(id,conversation_id,author_id,author_role,body) values(p_id,p_room,p_actor,p_role,p_body) on conflict(id) do nothing;
 update public.support_conversations set updated_at=now() where id=p_room;
 return query select * from public.support_messages where id=p_id;
end; $$;
commit;
