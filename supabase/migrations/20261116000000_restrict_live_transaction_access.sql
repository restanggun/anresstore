-- Live records contain supplier costs and operational notes. They must only be
-- exposed through an API that checks ownership and selects safe fields.
begin;
revoke select on public.live_transactions from authenticated;
drop policy if exists "Users read own live transactions" on public.live_transactions;
commit;
