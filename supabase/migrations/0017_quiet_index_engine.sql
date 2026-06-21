create extension if not exists pg_cron;

-- Aggregates each zone's currently-live sessions into one quiet_index row.
-- "Live" = an active session (end_ts is null) whose most recent score_ping
-- is within ACTIVE_WINDOW (45s = 3x the mobile client's 15s ping interval,
-- so one dropped ping doesn't flicker a session in and out of the count).
-- Quorum (SR-10): fewer than 3 live sessions in a zone -> no row at all for
-- that tick. This is the only write path into quiet_index (0007_quiet_index.sql
-- grants no insert to anon/authenticated), so there is no client request that
-- can force a broadcast below quorum.
create or replace function public.compute_quiet_index_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_window interval := interval '45 seconds';
begin
  with latest_ping as (
    select
      sp.session_id,
      sp.score,
      sp.ts,
      row_number() over (partition by sp.session_id order by sp.ts desc) as rn
    from public.score_pings sp
  ),
  live_session as (
    select
      s.zone_id,
      lp.score,
      -- weight decays linearly to 0 across the active window so a session's
      -- influence fades out smoothly rather than cutting off at a hard edge
      greatest(0, 1 - extract(epoch from (now() - lp.ts)) / extract(epoch from active_window)) as weight
    from latest_ping lp
    join public.sessions s on s.id = lp.session_id
    where lp.rn = 1
      and s.end_ts is null
      and lp.ts >= now() - active_window
  ),
  per_zone as (
    select
      zone_id,
      count(*) as active_count,
      sum(score * weight) / sum(weight) as value
    from live_session
    group by zone_id
    having sum(weight) > 0
  )
  insert into public.quiet_index (zone_id, value, active_count)
  select zone_id, round(value::numeric, 1), active_count
  from per_zone
  where active_count >= 3;
end;
$$;

-- Only the cron job (running as the function owner via security definer)
-- ever calls this; no client role needs execute.
revoke execute on function public.compute_quiet_index_rollups() from public, anon, authenticated;

select cron.schedule('quiet-index-tick', '15 seconds', $$select public.compute_quiet_index_rollups();$$);

-- Realtime: let app + dashboard subscribe to new rollups via postgres_changes.
-- quiet_index already has RLS enabled with a public-read policy (0007), so
-- this only adds the WAL-level broadcast on top of an already-readable table.
alter publication supabase_realtime add table public.quiet_index;
