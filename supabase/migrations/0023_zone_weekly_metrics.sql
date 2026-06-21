-- Operator weekly digest source (B5, Phase 7). This is the ONE function in the
-- system trusted to read across users to produce an operator's view of their
-- zone, so the entire privacy/authorization boundary lives HERE:
--   * SR-7: the authorization guard runs FIRST and rejects any operator who
--     does not own the zone, before a single row is read or aggregated.
--   * Privacy by construction (PRD 7.3): only AGGREGATED, anonymized values
--     ever leave this function. No session_id, no user_id, no per-user row is
--     ever projected into the result -- the FastAPI digest builder receives
--     numbers and trends, never people.
-- SECURITY DEFINER is required because the aggregates read tables an operator
-- has no RLS grant to read across users (sessions/score_pings/wallet_ledger/
-- redemptions belong to users, not operators); running as the function owner
-- lets us compute the summary while the guard above is what makes that safe.
create or replace function public.zone_weekly_metrics(p_zone_id uuid, p_operator_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_name text;
  v_min_score int;
  v_trend jsonb;
  v_check_in_count int;
  v_total_quiet_minutes numeric;
  v_total_points int;
  v_redemption_count int;
  v_peak jsonb;
begin
  -- Authorization guard FIRST (SR-7 / IDOR): an operator may only ever
  -- summarize a zone they own. Reading the zone name here doubles as the
  -- ownership check -- not found (wrong/foreign zone) => hard stop.
  select name, coalesce((reward_config->>'min_score_for_earning')::int, 70)
    into v_zone_name, v_min_score
  from public.zones
  where id = p_zone_id and operator_id = p_operator_id;

  if v_zone_name is null then
    raise exception 'not_authorized';
  end if;

  -- quiet_index daily trend over the 7-day window: one row per day, ordered.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', d.day,
        'avg_value', d.avg_value,
        'avg_active_count', d.avg_active_count
      )
      order by d.day
    ),
    '[]'::jsonb
  )
    into v_trend
  from (
    select
      date_trunc('day', ts) as day,
      round(avg(value), 2) as avg_value,
      round(avg(active_count), 2) as avg_active_count
    from public.quiet_index
    where zone_id = p_zone_id
      and ts >= now() - interval '7 days'
    group by date_trunc('day', ts)
  ) d;

  -- in-window check-ins for this zone
  select count(*)::int
    into v_check_in_count
  from public.sessions
  where zone_id = p_zone_id
    and created_at >= now() - interval '7 days';

  -- total eligible quiet minutes across the zone's in-window sessions, using
  -- the SAME gap-capped logic as compute_eligible_quiet_minutes (0019): for
  -- each pair of consecutive pings (per session, ordered by ts) whose EARLIER
  -- ping clears the zone's min-score threshold, credit the gap capped at 60s.
  -- The window partitions by session_id so a gap never bleeds across sessions.
  with pings as (
    select
      sp.ts,
      sp.score,
      lead(sp.ts) over (partition by sp.session_id order by sp.ts) as next_ts
    from public.score_pings sp
    join public.sessions s on s.id = sp.session_id
    where s.zone_id = p_zone_id
      and s.created_at >= now() - interval '7 days'
  )
  select round(coalesce(sum(
    extract(epoch from (least(next_ts, ts + interval '60 seconds') - ts))
  ), 0) / 60.0, 2)
    into v_total_quiet_minutes
  from pings
  where next_ts is not null
    and score >= v_min_score;

  -- points accrued for THIS zone in-window (reason + zone-tag filtered)
  select coalesce(sum(delta), 0)::int
    into v_total_points
  from public.wallet_ledger
  where reason = 'quiet_minute_accrual'
    and metadata->>'zone_id' = p_zone_id::text
    and created_at >= now() - interval '7 days';

  -- in-window redemptions for this zone
  select count(*)::int
    into v_redemption_count
  from public.redemptions
  where zone_id = p_zone_id
    and created_at >= now() - interval '7 days';

  -- busiest hour-of-day by peak active_count over the window. Null object when
  -- there is no quiet_index history yet.
  select jsonb_build_object(
    'hour_of_day', extract(hour from ts)::int,
    'max_active_count', active_count
  )
    into v_peak
  from public.quiet_index
  where zone_id = p_zone_id
    and ts >= now() - interval '7 days'
  order by active_count desc, ts desc
  limit 1;

  return jsonb_build_object(
    'zone_name', v_zone_name,
    'window_days', 7,
    'quiet_index_trend', v_trend,
    'check_in_count', v_check_in_count,
    'total_quiet_minutes', v_total_quiet_minutes,
    'total_points_accrued', v_total_points,
    'redemption_count', v_redemption_count,
    'peak_window', coalesce(v_peak, jsonb_build_object('hour_of_day', null, 'max_active_count', null))
  );
end;
$$;

-- Revoke the default PUBLIC execute grant, then hand execute to service_role
-- ONLY. service_role has BYPASSRLS but is NOT exempt from function EXECUTE
-- privilege, so the FastAPI digest builder (which calls this as service_role
-- via PostgREST RPC) needs an explicit grant; revoking from PUBLIC without it
-- would lock the service out too. anon/authenticated are deliberately left
-- without execute: exposing this to a signed-in client would hand them a
-- cross-user read primitive. (Same revoke-then-grant-the-caller idiom as
-- ingest_score_ping / redeem_reward, but the caller here is the server, not
-- the user, so the grant target is service_role rather than authenticated.)
revoke all on function public.zone_weekly_metrics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zone_weekly_metrics(uuid, uuid) to service_role;
