begin;
-- Hosted default privileges can grant more than the foundation migration.
-- Reset account access to the operations allowed by the profile RLS policies.
revoke all privileges on public.profiles from authenticated;
grant select,insert,update on public.profiles to authenticated;
commit;
