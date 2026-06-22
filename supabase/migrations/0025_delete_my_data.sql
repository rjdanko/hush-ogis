-- Right-to-erasure RPC (SR-12, PRD HR-P5). Deletes the caller's own
-- auth.users row (the actual login identity: email/credentials). public.users
-- has `id uuid primary key references auth.users(id) on delete cascade`
-- (0002_roles_and_users.sql), so deleting auth.users cascades INTO
-- public.users, which in turn cascades into sessions/wallet_ledger/
-- redemptions (and sessions -> score_pings), handling the rest of the chain.
-- Deliberately deletes auth.users rather than public.users directly: there is
-- no re-provisioning trigger that fires on a missing public.users row
-- (handle_new_user only fires `after insert on auth.users`, which already
-- happened for this account), so deleting public.users alone would leave a
-- permanently broken, logged-in-but-profileless account with no recovery
-- path. Deleting auth.users avoids that and is the more correct reading of
-- "right to erasure" -- the credentials disappear too, no zombie account.
-- Must fully schema-qualify auth.users since `search_path = public` below
-- does not include the auth schema.
-- SR-12 vs SR-13 note: 0021_redemptions.sql's header calls redemptions an
-- "immutable audit log" (SR-13), but no regulator/operator audit-retention
-- requirement currently exists for this product, so SR-12 erasure takes
-- precedence for this RPC and redemptions rows are cascaded away too.
-- No id parameter: the function always acts on auth.uid(), so there is no
-- IDOR surface -- a caller can never target another user's data.
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
