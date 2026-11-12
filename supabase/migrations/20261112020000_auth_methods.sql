begin;
create or replace function public.lookup_auth_methods(p_email text)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce((select jsonb_build_object('exists', true, 'confirmed', u.email_confirmed_at is not null,
    'providers', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id and i.provider in ('email','google')), '[]'::jsonb))
    from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1),
    jsonb_build_object('exists', false, 'confirmed', false, 'providers', '[]'::jsonb));
$$;
revoke all on function public.lookup_auth_methods(text) from public, anon, authenticated;
grant execute on function public.lookup_auth_methods(text) to service_role;
commit;
