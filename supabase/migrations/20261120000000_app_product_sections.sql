begin;

alter table public.managed_products
  add column if not exists section text
  check (section is null or char_length(section) between 1 and 100);

update public.managed_products
set section = case
  when provider_code = 'chatgpt-go-sharing-monthly' then 'Go'
  when provider_code in ('chatgpt-plus-sharing-monthly', 'chatgpt-plus-private-monthly') then 'Plus'
end,
updated_at = now()
where category = 'apps'
  and provider_code in (
    'chatgpt-go-sharing-monthly',
    'chatgpt-plus-sharing-monthly',
    'chatgpt-plus-private-monthly'
  );

commit;
