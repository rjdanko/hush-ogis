-- Pure, deterministic accrual math (PRD: "deterministic and unit-tested").
-- For each pair of consecutive score_pings (ordered by ts), if the EARLIER
-- ping's score clears the zone's min_score_for_earning threshold, the gap
-- between the two pings counts as eligible quiet time. A gap is capped at
-- 60 seconds (4x the mobile client's 15s ping interval, the same "generous
-- headroom without runaway crediting" reasoning as the score_pings rate
-- limit in 0016_score_ping_ingest.sql) so a dropped-ping gap or a paused
-- session can't be credited as if it were continuously quiet for that long.
-- The interval before the first ping and after the last ping is never
-- credited -- there's no signal yet / anymore to justify it.
create or replace function public.compute_eligible_quiet_minutes(p_session_id uuid, p_min_score int)
returns numeric
language sql
stable
as $$
  with pings as (
    select
      ts,
      score,
      lead(ts) over (order by ts) as next_ts
    from public.score_pings
    where session_id = p_session_id
  )
  select coalesce(sum(
    extract(epoch from (least(next_ts, ts + interval '60 seconds') - ts))
  ), 0) / 60.0
  from pings
  where next_ts is not null
    and score >= p_min_score;
$$;

-- Internal helper only -- exposing it directly to clients would let a user
-- probe arbitrary sessions' score patterns; it is only ever called from
-- accrue_session_points (security definer, below) which already enforces
-- who may trigger crediting for which session.
revoke all on function public.compute_eligible_quiet_minutes(uuid, int) from public, anon, authenticated;

-- Server-verified crediting (SR-8: never trust a client-claimed point
-- amount). SECURITY DEFINER is required because authenticated has no
-- insert grant on wallet_ledger (0009_wallet_ledger.sql) -- only this
-- function, running as its owner, may write a credit. Guarded so it can
-- only ever credit a session that has actually ended, and only once: a
-- malicious caller invoking this directly on someone else's already-ended,
-- not-yet-credited session would just credit that session's rightful
-- owner early (harmless, and checkout_session would have triggered the
-- same credit anyway) -- there is no path to mint points for yourself from
-- another user's session.
create or replace function public.accrue_session_points(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_zone public.zones;
  v_earn_rate numeric;
  v_min_score int;
  v_daily_cap int;
  v_eligible_minutes numeric;
  v_points int;
  v_already_credited boolean;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null or v_session.end_ts is null then
    return 0;
  end if;

  select exists(
    select 1 from public.wallet_ledger
    where reason = 'quiet_minute_accrual'
      and metadata->>'session_id' = p_session_id::text
  ) into v_already_credited;
  if v_already_credited then
    return 0;
  end if;

  select * into v_zone from public.zones where id = v_session.zone_id;
  v_earn_rate := coalesce((v_zone.reward_config->>'earn_rate_per_quiet_minute')::numeric, 0);
  v_min_score := coalesce((v_zone.reward_config->>'min_score_for_earning')::int, 100);
  v_daily_cap := (v_zone.reward_config->>'daily_point_cap')::int;

  v_eligible_minutes := public.compute_eligible_quiet_minutes(p_session_id, v_min_score);
  v_points := floor(v_eligible_minutes * v_earn_rate)::int;

  if v_daily_cap is not null and v_points > v_daily_cap then
    v_points := v_daily_cap;
  end if;

  if v_points > 0 then
    insert into public.wallet_ledger (user_id, delta, reason, metadata)
    values (
      v_session.user_id,
      v_points,
      'quiet_minute_accrual',
      jsonb_build_object(
        'session_id', p_session_id,
        'zone_id', v_session.zone_id,
        'eligible_minutes', round(v_eligible_minutes::numeric, 2)
      )
    );
  end if;

  return v_points;
end;
$$;

revoke all on function public.accrue_session_points(uuid) from public;
-- Called both directly (used by pgTAP and by checkout_session below, which
-- runs as the invoking authenticated user) and is the sole write path into
-- wallet_ledger credits.
grant execute on function public.accrue_session_points(uuid) to authenticated;
