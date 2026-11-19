begin;

create table public.admin_work_notification_reads (
  admin_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in ('orders', 'tasks', 'apps', 'reviews')),
  seen_through timestamptz not null,
  primary key (admin_id, section)
);
alter table public.admin_work_notification_reads enable row level security;
revoke all on public.admin_work_notification_reads from public, anon, authenticated;
grant select, insert, update on public.admin_work_notification_reads to service_role;

create function public.admin_work_notifications(p_admin uuid, p_sections text[], p_product_slugs text[])
returns table(section text, count integer, unread_count integer, snapshot_at timestamptz, recent jsonb)
language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select 'orders'::text as section, r.id, r.product_name as subject, r.invoice_number,
      r.created_at, coalesce(r.updated_at, r.created_at) as activity_at,
      case
        when r.payment_status = 'unknown' then 'Periksa pembayaran'
        when r.payment_status = 'paid' and
          (r.review_required or r.fulfillment_status in ('failed', 'unknown', 'manual_review')) then 'Periksa pemenuhan'
        when r.payment_status = 'paid' and r.fulfillment_mode = 'manual'
          and r.fulfillment_status in ('not_ready', 'ready', 'processing') then 'Proses pesanan manual'
      end as reason
    from public.admin_transaction_records r
    where 'orders' = any(p_sections) and r.source = 'checkout' and r.manual_kind is null
      and r.payment_mode = 'live'
    union all
    select 'tasks', p.id::text, p.product_name, p.invoice_number, p.created_at,
      greatest(p.updated_at, (
        select max(revision.created_at) from public.task_revisions revision
        where revision.payment_id = p.id and revision.decision = 'pending'
      )),
      case when p.status = 'paid' then
        case s.workflow_status
          when 'queued' then 'Mulai pengerjaan'
          when 'working' then 'Kerjakan pesanan'
          when 'revision_requested' then 'Tinjau revisi'
          when 'revision_working' then 'Kerjakan revisi'
        end
      end
    from public.task_order_specs s
    join public.payments p on p.id = s.payment_id
    join public.managed_products m on m.id = s.product_id
    where 'tasks' = any(p_sections) and p.payment_mode = 'live'
      and (cardinality(p_product_slugs) = 0 or m.product_slug = any(p_product_slugs))
    union all
    select 'apps', o.id::text, o.product_name, o.invoice_number, o.created_at, o.updated_at,
      case o.status
        when 'awaiting_qr' then 'Siapkan QRIS'
        when 'proof_submitted' then 'Periksa bukti pembayaran'
        when 'paid' then 'Kirim akun premium'
      end
    from public.premium_orders o
    join public.managed_products m on m.id = o.product_id
    where 'apps' = any(p_sections) and o.payment_mode = 'live'
      and (cardinality(p_product_slugs) = 0 or m.product_slug = any(p_product_slugs))
    union all
    select 'reviews', r.id::text, replace(r.product_slug, '-', ' '), i.invoice_number,
      r.created_at, r.created_at, 'Tinjau ulasan'
    from public.product_reviews r
    join public.invoices i on i.id = r.invoice_id
    where 'reviews' = any(p_sections) and r.status = 'pending' and r.purchase_verified
  ), flagged as (
    -- Until an admin opens the workspace, surface recent arrivals and outstanding work.
    select c.*,
      c.created_at > coalesce(reads.seen_through, statement_timestamp() - interval '1 day') as unread,
      case when c.reason is null then c.created_at else c.activity_at end as notification_at
    from candidates c
    left join public.admin_work_notification_reads reads
      on reads.admin_id = p_admin and reads.section = c.section
  ), ranked as (
    select f.*, row_number() over (partition by f.section order by f.notification_at desc, f.id) as rank
    from flagged f
    where f.unread or f.reason is not null
  )
  select s.section, count(r.id)::integer, count(r.id) filter (where r.unread)::integer,
    statement_timestamp(),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'subject', r.subject, 'invoice_number', r.invoice_number,
      'created_at', r.created_at, 'notification_at', r.notification_at, 'reason', r.reason, 'unread', r.unread
    ) order by r.rank) filter (where r.rank <= 5), '[]'::jsonb)
  from unnest(p_sections) as s(section)
  left join ranked r on r.section = s.section
  group by s.section;
$$;

create function public.mark_admin_work_notifications_read(p_admin uuid, p_section text, p_through timestamptz)
returns table(seen_through timestamptz)
language sql security invoker set search_path = '' as $$
  insert into public.admin_work_notification_reads as reads (admin_id, section, seen_through)
  values (p_admin, p_section, least(p_through, statement_timestamp()))
  on conflict (admin_id, section) do update
    set seen_through = greatest(reads.seen_through, excluded.seen_through)
  returning reads.seen_through;
$$;

revoke all on function public.admin_work_notifications(uuid, text[], text[]),
  public.mark_admin_work_notifications_read(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_work_notifications(uuid, text[], text[]),
  public.mark_admin_work_notifications_read(uuid, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
