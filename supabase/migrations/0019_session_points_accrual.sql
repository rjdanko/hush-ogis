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
