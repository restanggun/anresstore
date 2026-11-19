begin;

create table public.admin_assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  access_scope text not null check (char_length(access_scope) = 64),
  title text not null default 'Chat baru' check (char_length(title) between 1 and 80),
  touched_at timestamptz not null default now(),
  revision integer not null default 0 check (revision between 0 and 100),
  turns jsonb not null default '[]'::jsonb check (jsonb_typeof(turns) = 'array')
);
create index admin_assistant_sessions_actor_idx
  on public.admin_assistant_sessions (actor_id, access_scope, touched_at desc, id);
alter table public.admin_assistant_sessions enable row level security;
revoke all on public.admin_assistant_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.admin_assistant_sessions to service_role;

create table public.admin_assistant_memory (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000)
);
alter table public.admin_assistant_memory enable row level security;
revoke all on public.admin_assistant_memory from public, anon, authenticated;
grant select, insert, update, delete on public.admin_assistant_memory to service_role;

create function public.append_admin_assistant_turn(
  p_actor uuid, p_scope text, p_session uuid, p_revision integer,
  p_title text, p_turn jsonb
) returns table(revision integer)
language sql volatile security invoker set search_path = '' as $$
  update public.admin_assistant_sessions s
  set turns = s.turns || jsonb_build_array(p_turn),
      title = case when s.revision = 0 and s.title = 'Chat baru' then p_title else s.title end,
      revision = s.revision + 1,
      touched_at = now()
  where s.id = p_session and s.actor_id = p_actor and s.access_scope = p_scope
    and s.revision = p_revision and s.revision < 100
    and jsonb_typeof(p_turn) = 'object'
  returning s.revision;
$$;
revoke all on function public.append_admin_assistant_turn(uuid,text,uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_admin_assistant_turn(uuid,text,uuid,integer,text,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
