begin;
alter table public.support_conversations add column customer_read_at timestamptz not null default now();
alter table public.support_conversations add column staff_read_at timestamptz not null default now();
drop function public.support_ticket_notifications();
create function public.support_ticket_notifications()
returns table(new_count bigint,unread_count bigint,recent jsonb,recent_messages jsonb)
language sql stable security invoker set search_path='' as $$
 select (select count(*) from public.support_conversations where status='new'),
 (select count(distinct c.id) from public.support_conversations c join public.support_messages m on m.conversation_id=c.id where c.status<>'new' and m.author_role='customer' and m.created_at>c.staff_read_at),
 coalesce((select jsonb_agg(t order by t.created_at desc,t.id desc) from (select id,subject,created_at from public.support_conversations where status='new' order by created_at desc,id desc limit 5) t),'[]'::jsonb),
 coalesce((select jsonb_agg(t order by t.created_at desc) from (select c.id,c.subject,max(m.created_at) as created_at from public.support_conversations c join public.support_messages m on m.conversation_id=c.id where c.status<>'new' and m.author_role='customer' and m.created_at>c.staff_read_at group by c.id order by max(m.created_at) desc limit 5) t),'[]'::jsonb);
$$;
revoke all on function public.support_ticket_notifications() from public,anon,authenticated;
grant execute on function public.support_ticket_notifications() to service_role;
create function public.support_customer_notifications(p_user uuid)
returns table(unread_count bigint,recent jsonb) language sql stable security invoker set search_path='' as $$
 select (select count(distinct c.id) from public.support_conversations c join public.support_messages m on m.conversation_id=c.id where c.user_id=p_user and m.author_role='staff' and m.created_at>c.customer_read_at),
 coalesce((select jsonb_agg(t order by t.created_at desc) from (select c.id,c.subject,max(m.created_at) as created_at from public.support_conversations c join public.support_messages m on m.conversation_id=c.id where c.user_id=p_user and m.author_role='staff' and m.created_at>c.customer_read_at group by c.id order by max(m.created_at) desc limit 10) t),'[]'::jsonb);
$$;
revoke all on function public.support_customer_notifications(uuid) from public,anon,authenticated;
grant execute on function public.support_customer_notifications(uuid) to service_role;

create table public.support_email_outbox (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.support_conversations(id),
 event text not null check(event in ('new','in_progress','closed','rejected')),
 recipient_role text not null check(recipient_role in ('staff','customer')),
 recipient_user_id uuid references public.users(id),
 subject text not null,
 rejection_reason text,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 locked_until timestamptz,
 claim_token uuid,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(conversation_id,event)
);
create index support_email_pending_idx on public.support_email_outbox(next_attempt_at) where status in ('pending','sending');
alter table public.support_email_outbox enable row level security;
revoke all on public.support_email_outbox from public,anon,authenticated;
grant select,insert,update on public.support_email_outbox to service_role;
create function public.queue_support_email() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.support_email_outbox(conversation_id,event,recipient_role,subject) values(new.id,'new','staff',new.subject) on conflict do nothing;
 elsif new.status is distinct from old.status and new.status in ('in_progress','closed','rejected') then
  insert into public.support_email_outbox(conversation_id,event,recipient_role,recipient_user_id,subject,rejection_reason) values(new.id,new.status,'customer',new.user_id,new.subject,new.rejection_reason) on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.queue_support_email() from public,anon,authenticated;
grant execute on function public.queue_support_email() to service_role;
create trigger support_ticket_email after insert or update of status on public.support_conversations for each row execute function public.queue_support_email();
create function public.claim_support_emails() returns setof public.support_email_outbox language plpgsql security invoker set search_path='' as $$
begin
 update public.support_email_outbox set status='failed',locked_until=null,last_error='Delivery lease expired after final attempt' where status='sending' and locked_until<now() and attempts>=5;
 return query update public.support_email_outbox set status='sending',attempts=attempts+1,locked_until=now()+interval '5 minutes',claim_token=gen_random_uuid()
 where id in (select id from public.support_email_outbox where attempts<5 and next_attempt_at<=now() and (status='pending' or (status='sending' and locked_until<now())) order by created_at for update skip locked limit 5)
 returning *;
end;
$$;
create function public.finish_support_email(p_id uuid,p_claim uuid,p_success boolean,p_provider text,p_error text) returns setof public.support_email_outbox language sql security invoker set search_path='' as $$
 update public.support_email_outbox set status=case when p_success then 'sent' when attempts>=5 then 'failed' else 'pending' end,
 sent_at=case when p_success then now() else null end,provider_message_id=case when p_success then p_provider else provider_message_id end,
 last_error=case when p_success then null else left(p_error,200) end,locked_until=null,
 next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer))
 where id=p_id and claim_token=p_claim and status='sending' returning *;
$$;
revoke all on function public.claim_support_emails() from public,anon,authenticated;
revoke all on function public.finish_support_email(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_support_emails(),public.finish_support_email(uuid,uuid,boolean,text,text) to service_role;
notify pgrst,'reload schema';
commit;
