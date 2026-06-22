-- Right-to-erasure RPC (SR-12, PRD HR-P5). Deletes the caller's own
-- public.users row; every dependent table (sessions, score_pings via
-- sessions, wallet_ledger, redemptions) already has `on delete cascade`
-- back to public.users(id), so cascading FK deletes handle the rest.
-- Scope boundary: this does NOT delete the underlying auth.users identity
-- (email/credentials) -- that is a separate concern for server-side admin
-- tooling using the Supabase Admin API, outside this RPC's scope.
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

  delete from public.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
