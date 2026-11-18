begin;

alter table public.task_price_rules
  add column pricing_unit text not null default 'page'
  check (pricing_unit in ('page','slide','minute','item','custom')),
  add column base_fee bigint check (base_fee between 0 and 100000000);

alter table public.task_order_specs
  add column pricing_unit text not null default 'page'
  check (pricing_unit in ('page','slide','minute','item'));

comment on column public.task_price_rules.price_per_page is 'Rate per selected pricing_unit. Kept for compatibility with existing clients.';
comment on column public.task_order_specs.pages is 'Quantity of the saved pricing_unit. Historical rows use page.';

create or replace function public.quote_task_order(p_product uuid,p_pages integer,p_days integer,p_revisions integer)
returns bigint language plpgsql security invoker set search_path='' as $$
declare variant public.managed_products; rule public.task_price_rules; total bigint;
begin
  select * into variant from public.managed_products where id=p_product and category='tasks' and active and deleted_at is null for share;
  select * into rule from public.task_price_rules where product_id=p_product for share;
  if variant.id is null or rule.product_id is null or rule.pricing_unit='custom'
    or p_pages is null or p_days is null or p_revisions is null
    or p_pages<1 or p_pages>rule.max_pages or p_days<1 or p_days>90 or p_revisions<0 or p_revisions>rule.max_revisions then
    raise exception 'Task pricing unavailable' using errcode='PT409';
  end if;
  total := coalesce(rule.base_fee,variant.price) + rule.price_per_page*p_pages + rule.price_per_revision*p_revisions
    + rule.rush_fee_per_day*greatest(rule.standard_days-p_days,0);
  if total<1 or total>100000000 then raise exception 'Task price out of range' using errcode='PT409'; end if;
  return total;
end; $$;

create function public.snapshot_task_pricing_unit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_unit text;
begin
  select rule.pricing_unit into current_unit from public.task_price_rules rule
    where rule.product_id=new.product_id for share;
  if current_unit is null or current_unit='custom' or new.pricing_unit is distinct from current_unit then
    raise exception 'Task pricing unavailable' using errcode='PT409';
  end if;
  return new;
end; $$;

create trigger snapshot_task_pricing_unit before insert on public.task_order_specs
for each row execute function public.snapshot_task_pricing_unit();
revoke all on function public.snapshot_task_pricing_unit() from public, anon, authenticated;
grant execute on function public.snapshot_task_pricing_unit() to service_role;

create or replace function public.reserve_task_payment(p_payment jsonb,p_task jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; product_id uuid; quoted bigint; existing public.task_order_specs;
begin
  if p_payment->>'source'<>'tasks' or p_payment->>'fulfillment_mode'<>'manual' or p_payment->>'payment_mode' not in ('live','sandbox')
    or p_payment->>'provider_code' !~ '^managed\.[0-9a-f-]{36}$' then
    raise exception 'Invalid task payment' using errcode='PT409';
  end if;
  product_id := substring(p_payment->>'provider_code' from 9)::uuid;
  quoted := public.quote_task_order(product_id,(p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer);
  if quoted<>(p_payment->>'amount')::bigint then raise exception 'Task price changed' using errcode='PT409'; end if;
  result := public.reserve_payment(p_payment);
  insert into public.task_order_specs(payment_id,product_id,instructions,reference_url,pages,deadline_days,purchased_revisions,quoted_amount,pricing_unit)
  values((result->'payment'->>'id')::uuid,product_id,p_task->>'instructions',nullif(p_task->>'reference_url',''),
    (p_task->>'pages')::integer,(p_task->>'deadline_days')::integer,(p_task->>'revisions')::integer,quoted,coalesce(p_task->>'pricing_unit','page'))
  on conflict(payment_id) do nothing;
  select * into existing from public.task_order_specs where payment_id=(result->'payment'->>'id')::uuid;
  if existing.product_id<>product_id or existing.instructions<>p_task->>'instructions'
    or existing.reference_url is distinct from nullif(p_task->>'reference_url','')
    or existing.pages<>(p_task->>'pages')::integer or existing.deadline_days<>(p_task->>'deadline_days')::integer
    or existing.purchased_revisions<>(p_task->>'revisions')::integer or existing.quoted_amount<>quoted or existing.pricing_unit is distinct from coalesce(p_task->>'pricing_unit','page') then
    raise exception 'Task order conflict' using errcode='PT409';
  end if;
  return result;
end; $$;

-- Publish from admin only after setting the store's actual prices and terms.
with seeds(code, product, slug, section, name, description, unit, max_units) as (
  values
    ('joki-makalah-halaman','Makalah','makalah','Penulisan','Makalah per lembar','Cantumkan topik, struktur, gaya sitasi, dan jumlah lembar.', 'page',100),
    ('joki-artikel-halaman','Artikel','artikel','Penulisan','Artikel per lembar','Cantumkan topik, sasaran pembaca, dan format artikel.', 'page',100),
    ('joki-esai-halaman','Esai','esai','Penulisan','Esai per lembar','Cantumkan tema, tujuan, format, dan sumber rujukan.', 'page',100),
    ('joki-laporan-halaman','Laporan','laporan','Penulisan','Laporan per lembar','Cantumkan jenis laporan, struktur, dan bahan yang tersedia.', 'page',150),
    ('joki-ppt-slide','PPT','ppt','Presentasi','Desain presentasi per slide','Cantumkan jumlah slide, topik, dan format file hasil.', 'slide',100),
    ('joki-desain-poster','Desain grafis','desain-grafis','Poster','Desain poster','Cantumkan konsep, ukuran, tujuan, dan format file hasil.', 'custom',1),
    ('joki-desain-flyer','Desain grafis','desain-grafis','Flyer','Desain flyer','Cantumkan ukuran, kebutuhan cetak atau digital, serta materi yang sudah ada.', 'custom',1),
    ('joki-desain-konten','Desain grafis','desain-grafis','Konten','Desain konten media sosial','Cantumkan platform, konsep, dan jumlah konten yang dibutuhkan.', 'custom',1),
    ('joki-capcut-menit','Editing video CapCut','editing-video-capcut','Per menit','Edit video per menit','Isi durasi video hasil yang diinginkan dalam menit bulat, bukan durasi bahan mentah.', 'minute',120),
    ('joki-capcut-custom','Editing video CapCut','editing-video-capcut','Custom','Edit video custom','Jelaskan durasi, gaya edit, level efek, subtitle, dan kebutuhan file proyek.', 'custom',1),
    ('joki-website-custom','Website','website','Pembuatan website','Pembuatan website custom','Cantumkan tujuan, halaman, fitur, dan tenggat. Jangan sertakan kredensial.', 'custom',1),
    ('joki-android-custom','Aplikasi Android','aplikasi-android','Pembuatan aplikasi','Pembuatan aplikasi Android custom','Cantumkan kebutuhan fitur, integrasi, tenggat, dan format hasil.', 'custom',1)
), inserted as (
  insert into public.managed_products (id,provider,provider_code,category,product,product_slug,section,name,price,description,active,fulfillment_mode,supplier_code)
  select gen_random_uuid(),'manual',code,'tasks',product,slug,section,name,1000,description,false,'manual',code
  from seeds on conflict (provider,category,provider_code) do nothing
  returning id,provider_code
)
insert into public.task_price_rules (product_id,price_per_page,price_per_revision,rush_fee_per_day,standard_days,max_pages,max_revisions,pricing_unit,base_fee)
select inserted.id,0,0,0,7,seeds.max_units,0,seeds.unit,0
from inserted join seeds on seeds.code=inserted.provider_code;

notify pgrst, 'reload schema';
commit;
