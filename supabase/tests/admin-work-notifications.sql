begin;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000011', 'notification-admin@example.com'),
  ('10000000-0000-4000-8000-000000000012', 'notification-other@example.com');

insert into public.managed_products
  (id, provider, provider_code, category, product, product_slug, name, price, active, fulfillment_mode)
values
  ('10000000-0000-4000-8000-000000000021', 'manual', 'TEST-NOTIFY-TASK', 'tasks', 'Tugas', 'notification-task', 'Esai', 10000, true, 'manual'),
  ('10000000-0000-4000-8000-000000000022', 'manual', 'TEST-NOTIFY-APP', 'apps', 'Aplikasi', 'notification-app', 'Aplikasi', 10000, true, 'manual');

insert into public.task_price_rules
  (product_id, price_per_page, price_per_revision, rush_fee_per_day, standard_days, max_pages, max_revisions)
values ('10000000-0000-4000-8000-000000000021', 10000, 0, 0, 7, 100, 3);

do $$
declare
  actor constant uuid := '10000000-0000-4000-8000-000000000011';
  other_actor constant uuid := '10000000-0000-4000-8000-000000000012';
  game_id constant uuid := '10000000-0000-4000-8000-000000000031';
  task_id constant uuid := '10000000-0000-4000-8000-000000000032';
  app_id constant uuid := '10000000-0000-4000-8000-000000000033';
  sections constant text[] := array['orders', 'tasks', 'apps', 'reviews'];
  order_payload jsonb := jsonb_build_object(
    'id', game_id, 'payment_mode', 'live', 'access_hash', repeat('a',64),
    'request_hash', repeat('b',64), 'source', 'game', 'provider_code', 'ml5',
    'product_name', 'Mobile Legends - 5 Diamonds', 'target', '123', 'amount', 10000,
    'method', 'QRIS2', 'guest_session_hash', repeat('c',64), 'checkout_hash', repeat('d',64),
    'fulfillment_mode', 'vipayment', 'provider_cost', 1500, 'invoice_product_code', 'mobile-legends',
    'invoice_subproduct_code', 'ml-5', 'product_slug', 'mobile-legends'
  );
  snapshot timestamptz;
  observed integer;
  mail_job record;
begin
  perform public.reserve_payment(order_payload);
  perform public.reserve_payment(order_payload || jsonb_build_object(
    'id', task_id, 'source', 'tasks', 'provider_code', 'TEST-NOTIFY-TASK', 'product_name', 'Esai',
    'invoice_product_code', 'notification-task', 'invoice_subproduct_code', 'esai',
    'product_slug', 'notification-task', 'checkout_hash', repeat('e',64), 'fulfillment_mode', 'manual'
  ));
  insert into public.task_order_specs
    (payment_id, product_id, instructions, pages, deadline_days, purchased_revisions, quoted_amount)
  values (task_id, '10000000-0000-4000-8000-000000000021', 'Tulis esai uji notifikasi', 1, 7, 0, 10000);

  insert into public.premium_orders
    (id, product_id, product_name, access_type, duration_days, guarantee_days, guarantee_terms,
      amount, customer_email, guest_session_hash)
  values (app_id, '10000000-0000-4000-8000-000000000022', 'Aplikasi', 'private', 30, 5,
    'Garansi uji notifikasi', 10000, 'buyer@example.com', repeat('f',64));

  insert into public.product_reviews (category, product_slug, rating, comment, reviewer_email, invoice_id, purchase_verified)
  values ('game', 'mobile-legends', 4.5, 'Ulasan uji notifikasi', 'buyer@example.com', game_id, true);

  if (select array_agg(n.count order by n.section) from public.admin_work_notifications(actor, sections, '{}') n)
      is distinct from array[1, 1, 1, 1] then
    raise exception 'New orders and reviews were missing or double counted';
  end if;
  if (select n.count from public.admin_work_notifications(actor, array['tasks'], array['other-task']) n) <> 0
    or (select n.count from public.admin_work_notifications(actor, array['tasks'], array['notification-task']) n) <> 1 then
    raise exception 'Task notification did not respect product scope';
  end if;

  select n.snapshot_at into snapshot from public.admin_work_notifications(actor, array['apps'], '{}') n;
  perform * from public.mark_admin_work_notifications_read(actor, 'apps', snapshot);
  perform * from public.mark_admin_work_notifications_read(actor, 'apps', snapshot - interval '1 minute');
  if (select n.count from public.admin_work_notifications(actor, array['apps'], '{}') n) <> 1
    or (select n.unread_count from public.admin_work_notifications(actor, array['apps'], '{}') n) <> 0
    or (select n.unread_count from public.admin_work_notifications(other_actor, array['apps'], '{}') n) <> 1 then
    raise exception 'Read receipts were not monotonic per admin or removed actionable work';
  end if;

  update public.premium_orders set status = 'awaiting_payment' where id = app_id;
  update public.product_reviews set status = 'published' where invoice_id = game_id;
  select sum(n.count) into observed from public.admin_work_notifications(actor, array['apps', 'reviews'], '{}') n;
  if observed <> 0 then raise exception 'Handled work remained in the notification queue'; end if;
  if (select n.unread_count from public.admin_work_notifications(actor, array['orders'], '{}') n) <> 1 then
    raise exception 'Opening premium orders cleared checkout notifications';
  end if;

  if (select count(*) from public.support_email_outbox where event = 'admin') <> 4
    or exists (select 1 from public.claim_support_emails()) then
    raise exception 'New orders and reviews did not queue staff alerts exclusively';
  end if;

  update public.payments set status = 'paid', reference = 'ORDER-EMAIL-GAME', revision = revision + 1 where id = game_id;
  update public.payments set status = 'paid', reference = 'ORDER-EMAIL-TASK', revision = revision + 1 where id = task_id;
  update public.payments set status = 'paid', revision = revision + 1 where id = game_id;
  update public.premium_orders set status = 'proof_submitted' where id = app_id;
  update public.premium_orders set status = 'proof_submitted' where id = app_id;
  update public.premium_orders set status = 'awaiting_payment' where id = app_id;
  update public.premium_orders set status = 'proof_submitted' where id = app_id;
  update public.premium_orders set status = 'paid', paid_at = now() where id = app_id;

  if (select count(*) from public.support_email_outbox where event = 'admin') <> 8
    or (select count(*) from public.support_email_outbox where admin_title = 'Periksa bukti pembayaran aplikasi premium') <> 2 then
    raise exception 'Admin emails missed an actionable event or duplicated the same transition';
  end if;
  select * into mail_job from public.claim_support_emails('resend') limit 1;
  if mail_job.id is null or mail_job.subject not like 'ANRS-%'
    or (select count(*) from public.claim_support_emails('resend')) <> 3
    or exists (select 1 from public.claim_support_emails('customer')) then
    raise exception 'Staff channel did not exclusively lease the generated alerts';
  end if;
  perform public.finish_support_email(mail_job.id, gen_random_uuid(), true, null, null);
  if (select status from public.support_email_outbox where id = mail_job.id) <> 'sending' then
    raise exception 'A stale claim acknowledged an email';
  end if;
  perform public.finish_support_email(mail_job.id, mail_job.claim_token, false, null, 'SMTP delivery unavailable');
  if not exists (select 1 from public.support_email_outbox where id = mail_job.id
      and status = 'pending' and attempts = 1 and next_attempt_at > now()) then
    raise exception 'A failed admin email was not queued for retry';
  end if;
end;
$$;

set local role service_role;
select * from public.admin_work_notifications('10000000-0000-4000-8000-000000000011', array['orders', 'tasks', 'apps', 'reviews'], '{}');
reset role;

do $$ begin
  if has_function_privilege('authenticated', 'public.admin_work_notifications(uuid,text[],text[])', 'execute')
    or has_function_privilege('anon', 'public.mark_admin_work_notifications_read(uuid,text,timestamptz)', 'execute')
    or has_table_privilege('authenticated', 'public.admin_work_notification_reads', 'select')
    or has_function_privilege('anon', 'public.claim_support_emails(text)', 'execute')
    or has_table_privilege('authenticated', 'public.support_email_outbox', 'select') then
    raise exception 'Notification data is exposed outside admin API';
  end if;
end $$;

rollback;
