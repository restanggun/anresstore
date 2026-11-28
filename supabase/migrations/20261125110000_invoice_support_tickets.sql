begin;

alter table public.support_conversations
  add column invoice_id uuid references public.invoices(id);
create index support_conversations_invoice_open_idx
  on public.support_conversations(invoice_id,user_id)
  where invoice_id is not null and status in ('new','in_progress');
create index support_conversations_payment_open_idx
  on public.support_conversations(payment_id,user_id)
  where payment_id is not null and status in ('new','in_progress');

create function public.invoice_support_context(p_invoice text,p_user uuid,p_guest_hash text,p_verified_email text)
returns table(invoice_id uuid,invoice_number text,ticket_id uuid)
language sql stable security invoker set search_path='' as $$
  select i.id,i.invoice_number,room.id
  from public.invoices i
  left join public.premium_orders premium on premium.id=i.premium_order_id
  left join lateral (
    select c.id
    from public.support_conversations c
    where c.user_id=p_user and c.status in ('new','in_progress')
      and (c.invoice_id=i.id or c.payment_id=i.payment_id or c.id=premium.conversation_id)
    order by (c.id=premium.conversation_id) desc nulls last,
      (c.invoice_id=i.id) desc nulls last,c.created_at desc,c.id
    limit 1
  ) room on true
  where (i.invoice_number=p_invoice or i.id=case
    when p_invoice ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then p_invoice::uuid end)
    and p_user is not null and i.archived_at is null
    and (
      coalesce(i.owner_user_id,i.claimed_user_id)=p_user
      or (
        i.owner_user_id is null and i.claimed_user_id is null
        and i.guest_session_hash=p_guest_hash
        and lower(btrim(i.customer_email))=lower(btrim(p_verified_email))
        and i.created_at between now()-interval '30 days' and now()+interval '1 minute'
      )
    )
  limit 1;
$$;

create function public.create_invoice_support_ticket(
  p_id uuid,p_invoice text,p_user uuid,p_guest_hash text,p_verified_email text,p_subject text,p_body text
)
returns table(id uuid,reused boolean)
language plpgsql security invoker set search_path='' as $$
declare
  context record;
  existing public.support_conversations;
  message text;
begin
  select * into context from public.invoice_support_context(p_invoice,p_user,p_guest_hash,p_verified_email);
  if not found then return; end if;
  -- Serialize submissions for a single invoice even when callers use different references.
  perform 1 from public.invoices where invoices.id=context.invoice_id for update;
  select * into context from public.invoice_support_context(context.invoice_id::text,p_user,p_guest_hash,p_verified_email);
  if not found then return; end if;

  select * into existing from public.support_conversations where support_conversations.id=p_id;
  if found then
    if existing.user_id<>p_user or existing.invoice_id is distinct from context.invoice_id then
      raise exception 'Ticket conflict' using errcode='PT409';
    end if;
    return query select existing.id,false;
    return;
  end if;
  if context.ticket_id is not null then
    return query select context.ticket_id,true;
    return;
  end if;

  message := 'Invoice ' || context.invoice_number || chr(10) || chr(10) || btrim(p_body);
  perform public.create_support_ticket(p_id,p_user,p_subject,message);
  update public.support_conversations set invoice_id=context.invoice_id where support_conversations.id=p_id;
  return query select p_id,false;
end;
$$;

revoke all on function public.invoice_support_context(text,uuid,text,text),
  public.create_invoice_support_ticket(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.invoice_support_context(text,uuid,text,text),
  public.create_invoice_support_ticket(uuid,text,uuid,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
