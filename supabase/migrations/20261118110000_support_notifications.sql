begin;
create index if not exists support_conversations_waiting_idx on public.support_conversations(created_at desc) where status='new';
create function public.support_ticket_notifications()
returns table(new_count bigint,recent jsonb)
language sql stable security invoker set search_path='' as $$
 select (select count(*) from public.support_conversations where status='new'),
 coalesce((select jsonb_agg(t order by t.created_at desc,t.id desc) from
  (select id,subject,created_at from public.support_conversations where status='new' order by created_at desc,id desc limit 5) t),'[]'::jsonb);
$$;
revoke all on function public.support_ticket_notifications() from public,anon,authenticated;
grant execute on function public.support_ticket_notifications() to service_role;
commit;
