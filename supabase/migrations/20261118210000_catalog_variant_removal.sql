-- Retain supplier overrides after removal so default variants stay unpublished.
alter table public.managed_products add column if not exists deleted_at timestamptz;
