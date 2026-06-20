-- Closes a session. achieved_minutes is computed here from start_ts/now()
-- rather than accepted from the client -- even though it's only a display
-- placeholder until Phase 4's real scoring lands, the same "never trust a
-- client-claimed number" rule from PRD SR-8 applies. security invoker: the
-- explicit user_id = auth.uid() check is defense-in-depth on top of the
-- sessions_update_own RLS policy (0005_sessions.sql), matching the pattern
-- already used for zones/rewards (0008_rewards.sql, 0011_rls_update_with_check.sql).
create or replace function public.checkout_session(p_session_id uuid)
returns public.sessions
language plpgsql
security invoker
as $$
declare
  result public.sessions;
begin
  update public.sessions
  set end_ts = now(),
      achieved_minutes = greatest(0, round(extract(epoch from (now() - start_ts)) / 60)::int)
  where id = p_session_id
    and user_id = auth.uid()
    and end_ts is null
  returning * into result;

  if result.id is null then
    raise exception 'session not found, not yours, or already checked out'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

grant execute on function public.checkout_session(uuid) to authenticated;
