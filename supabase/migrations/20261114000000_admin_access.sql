begin;
create table public.admin_roles (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 80),
  permissions text[] not null default '{}',
  categories text[] not null default '{}',
  product_slugs text[] not null default '{}',
  check (permissions <@ array['orders.read','payments.read','support.read','support.write','products.read','products.write']::text[]),
  check (categories <@ array['game','prepaid','apps']::text[])
);
create table public.admin_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid references public.admin_roles(id) on delete restrict,
  is_super boolean not null default false,
  check ((is_super and role_id is null) or (not is_super and role_id is not null))
);
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
alter table public.admin_roles enable row level security;
alter table public.admin_assignments enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_roles, public.admin_assignments, public.admin_audit_log from public, anon, authenticated;
grant select, insert, update, delete on public.admin_roles, public.admin_assignments to service_role;
revoke all on public.admin_audit_log from service_role;
grant select, insert on public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;
commit;
