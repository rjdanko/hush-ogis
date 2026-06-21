-- Re-defines checkout_session (0015_checkout_session.sql) to also finalize
-- final_score (simple average of this session's score_pings -- null if the
-- device never sent one, e.g. it was checked out instantly) and trigger
-- server-verified point accrual. Stays SECURITY INVOKER like the original:
-- the UPDATE's security still rests on the explicit user_id = auth.uid()
-- check plus sessions_update_own RLS; accrue_session_points (SECURITY
-- DEFINER, granted to authenticated in 0019) is the only part of this
-- function that needs elevated privilege, and it enforces its own guards.
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
      achieved_minutes = greatest(0, round(extract(epoch from (now() - start_ts)) / 60)::int),
      final_score = (select round(avg(score)) from public.score_pings where session_id = p_session_id)
  where id = p_session_id
    and user_id = auth.uid()
    and end_ts is null
  returning * into result;

  if result.id is null then
    raise exception 'session not found, not yours, or already checked out'
      using errcode = 'P0002';
  end if;

  perform public.accrue_session_points(p_session_id);

  return result;
end;
$$;

grant execute on function public.checkout_session(uuid) to authenticated;
