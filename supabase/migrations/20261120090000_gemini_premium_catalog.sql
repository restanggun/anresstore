begin;

with variants (code, section, name, price, duration_days, access_type, description) as (
  values
    ('gemini-head-6m', 'Head Akun', 'Jasa Payment 6 Bulan', 30000, 180, 'private', 'Jasa pembayaran Gemini untuk akunmu.'),
    ('gemini-head-1y', 'Head Akun', 'Jasa Payment 1 Tahun', 55000, 365, 'private', 'Jasa pembayaran Gemini untuk akunmu.'),
    ('gemini-head-2y', 'Head Akun', 'Jasa Payment 2 Tahun', 70000, 730, 'private', 'Jasa pembayaran Gemini untuk akunmu.'),
    ('gemini-invite-1y', 'Invite', 'Invite 1 Tahun', 30000, 365, 'other', 'Akses Gemini melalui undangan.')
), inserted as (
  insert into public.managed_products (
    id, provider, category, provider_code, product, product_slug, section,
    name, price, description, active, fulfillment_mode, supplier_code
  )
  select gen_random_uuid(), 'manual', 'apps', code, 'Gemini', 'gemini', section,
    name, price, description, true, 'manual', code
  from variants
  on conflict (provider, category, provider_code) do nothing
  returning id, provider_code
)
insert into public.premium_product_rules (
  product_id, access_type, duration_days, guarantee_days, guarantee_terms
)
select inserted.id, variants.access_type, variants.duration_days, 0,
  'Hubungi CS untuk informasi ketentuan garansi.'
from inserted
join variants on variants.code = inserted.provider_code;

commit;
