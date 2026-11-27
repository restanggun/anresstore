begin;

alter table public.support_email_outbox
  alter column conversation_id drop not null,
  drop constraint support_email_outbox_event_check,
  add constraint support_email_outbox_event_check check(event in ('new','in_progress','closed','rejected','admin')),
  add constraint support_email_outbox_admin_event_check check(
    (event = 'admin' and recipient_role = 'staff' and conversation_id is null)
    or (event <> 'admin' and conversation_id is not null)
  ),
  add column admin_title text;

create function public.queue_admin_notification_email() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  title text;
  detail text;
begin
  case TG_TABLE_NAME
    when 'support_messages' then
      select 'Pesan pelanggan baru', c.subject || ' · #' || left(c.id::text, 8)
        into title, detail
        from public.support_conversations c
        where c.id = new.conversation_id and c.status <> 'new';
    when 'payments' then
      if new.payment_mode <> 'live' or new.archived_at is not null then return new; end if;
      detail := concat_ws(' · ', new.invoice_number, new.product_name);
      if TG_OP = 'INSERT' then
        title := case when new.source = 'tasks' then 'Pesanan joki tugas baru' else 'Pesanan baru' end;
      elsif new.status is distinct from old.status then
        title := case new.status
          when 'unknown' then 'Periksa pembayaran'
          when 'paid' then case when new.source = 'tasks' then 'Mulai pengerjaan joki tugas'
            when new.fulfillment_mode = 'manual' then 'Proses pesanan manual' end
        end;
      end if;
    when 'live_transactions' then
      if new.payment_mode = 'live' and new.payment_status = 'paid'
        and (new.review_required or new.fulfillment_status in ('failed', 'unknown', 'manual_review'))
        and (TG_OP = 'INSERT' or old.payment_status is distinct from new.payment_status
          or old.fulfillment_status is distinct from new.fulfillment_status
          or old.review_required is distinct from new.review_required) then
        title := 'Periksa pemenuhan pesanan';
        detail := concat_ws(' · ', new.invoice_number, new.product_name);
      end if;
    when 'task_revisions' then
      select 'Permintaan revisi joki tugas', concat_ws(' · ', p.invoice_number, p.product_name)
        into title, detail from public.payments p
        where p.id = new.payment_id and p.payment_mode = 'live' and p.archived_at is null;
    when 'premium_orders' then
      if new.payment_mode <> 'live' or new.archived_at is not null then return new; end if;
      detail := concat_ws(' · ', new.invoice_number, new.product_name);
      if TG_OP = 'INSERT' then
        title := 'Pesanan aplikasi premium baru';
      elsif new.status is distinct from old.status then
        title := case new.status when 'proof_submitted' then 'Periksa bukti pembayaran aplikasi premium'
          when 'paid' then 'Kirim akun premium' end;
      end if;
    when 'product_reviews' then
      if TG_OP = 'UPDATE' and old.status = 'pending' and old.purchase_verified then return new; end if;
      select 'Rating dan ulasan baru', concat_ws(' · ', i.invoice_number, replace(new.product_slug, '-', ' '))
        into title, detail from public.invoices i where i.id = new.invoice_id and i.payment_mode = 'live';
  end case;

  if title is not null then
    insert into public.support_email_outbox(event, recipient_role, subject, admin_title)
      values ('admin', 'staff', detail, title);
  end if;
  return new;
end;
$$;

revoke all on function public.queue_admin_notification_email() from public, anon, authenticated;

grant execute on function public.queue_admin_notification_email() to service_role;

create trigger admin_email_support_message after insert on public.support_messages
  for each row when (new.author_role = 'customer') execute function public.queue_admin_notification_email();

create trigger admin_email_payment after insert or update of status on public.payments
  for each row execute function public.queue_admin_notification_email();

create trigger admin_email_fulfillment after insert or update of payment_status, fulfillment_status, review_required on public.live_transactions
  for each row execute function public.queue_admin_notification_email();

create trigger admin_email_task_revision after insert on public.task_revisions
  for each row when (new.decision = 'pending') execute function public.queue_admin_notification_email();

create trigger admin_email_premium_order after insert or update of status on public.premium_orders
  for each row execute function public.queue_admin_notification_email();

create trigger admin_email_product_review after insert or update of status, purchase_verified on public.product_reviews
  for each row when (new.status = 'pending' and new.purchase_verified) execute function public.queue_admin_notification_email();

create function public.claim_support_emails(p_channel text) returns setof public.support_email_outbox
language plpgsql security invoker set search_path='' as $$
begin
  update public.support_email_outbox set status='failed', locked_until=null, last_error='Delivery lease expired after final attempt'
    where status='sending' and locked_until<now() and attempts>=5;
  return query update public.support_email_outbox
    set status='sending', attempts=attempts+1, locked_until=now()+interval '5 minutes', claim_token=gen_random_uuid()
    where id in (
      select id from public.support_email_outbox where attempts<5 and next_attempt_at<=now()
        and (status='pending' or (status='sending' and locked_until<now()))
        and case p_channel
          when 'resend' then recipient_role='staff'
          when 'customer' then recipient_role='customer'
          when 'legacy' then event<>'admin'
          else false end
      order by created_at, id for update skip locked limit 5
    ) returning *;
end;
$$;

create or replace function public.claim_support_emails() returns setof public.support_email_outbox
language sql security invoker set search_path='' as $$
  select * from public.claim_support_emails('legacy');
$$;

revoke all on function public.claim_support_emails(text) from public, anon, authenticated;

grant execute on function public.claim_support_emails(text) to service_role;

notify pgrst, 'reload schema';

commit;
