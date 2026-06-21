-- supabase/tests/database/020_zone_weekly_metrics.sql
-- Fixture tests for public.zone_weekly_metrics() (0023_zone_weekly_metrics.sql).
-- This function is the ONLY thing in the system trusted to read across users,
-- so the two security properties under test are non-negotiable:
--   (1) the IDOR guard (an operator may only summarize a zone they own), and
--   (2) anonymity (no per-user identifier ever appears in the returned payload).
-- Everything else asserts the aggregate math against known, hand-computed
-- fixtures so this stays a deterministic unit, not a tautology.
--
-- (Numbered 020 rather than the 015 the plan named, because 015 is already
-- taken by 015_compute_eligible_quiet_minutes.sql; `supabase test db` runs the
-- whole directory, so the file's number only affects ordering, not behavior.)
begin;
select plan(8);

-- Two operators, each owning their own zone (the IDOR fixture).
select tests.create_test_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'::uuid); -- operatorA
select tests.create_test_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid); -- operatorB
-- A separate plain user who owns the seeded sessions. Going through
-- create_test_user seeds BOTH auth.users and (via the on_auth_user_created
-- trigger) public.users, which sessions.user_id references. We assert below
-- that THIS uuid never leaks into the digest.
select tests.create_test_user('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0'::uuid); -- session owner

-- Seed mutable / no-client-insert tables as postgres: wallet_ledger,
-- redemptions, and quiet_index have no client insert grant, and direct inserts
-- as postgres bypass RLS (reset role does NOT clear the JWT claims, but it does
-- drop us back to the postgres login role for grant purposes).
reset role;

insert into public.operators (id, venue_name) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Op A'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Op B')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence, reward_config) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Zone A',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Zone B',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb);

-- ---------------------------------------------------------------------------
-- quiet_index history for Zone A, across two distinct days and hours so the
-- trend has two day-entries and peak_window is unambiguous. The max
-- active_count seeded anywhere in-window is 9 (day 1, hour 14).
-- ---------------------------------------------------------------------------
insert into public.quiet_index (zone_id, ts, value, active_count) values
  -- day 1 (2 days ago), hour 14: highest active_count overall
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', (now() - interval '2 days')::date + time '14:00', 80, 9),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', (now() - interval '2 days')::date + time '14:30', 90, 7),
  -- day 2 (1 day ago), hour 9
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', (now() - interval '1 day')::date + time '09:00', 60, 4),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', (now() - interval '1 day')::date + time '09:30', 70, 6);
-- a stale row OUTSIDE the 7-day window must be ignored by every aggregate
insert into public.quiet_index (zone_id, ts, value, active_count) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '30 days', 100, 99);

-- ---------------------------------------------------------------------------
-- One checked-out session for Zone A with score_pings that produce a KNOWN
-- eligible quiet-minute total under the threshold of 70:
--   ping@T   score 90  -> gap to next = 30s, capped 60 -> 30s eligible (>=70)
--   ping@T+30 score 90 -> gap to next = 60s, capped 60 -> 60s eligible (>=70)
--   ping@T+90 score 50 -> no next ping -> not counted (and <70 anyway)
-- total = 90s = 1.50 minutes.
-- A second ping below threshold is added at the very start to prove the
-- threshold filter bites: a leading sub-70 ping's gap must NOT be credited.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id, start_ts, end_ts, created_at) values
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   now() - interval '1 day', now() - interval '1 day' + interval '5 minutes', now() - interval '1 day');
insert into public.score_pings (session_id, score, ts) values
  -- leading sub-threshold ping: its gap (30s) must be excluded (score 50 < 70)
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 50, now() - interval '1 day' - interval '30 seconds'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 90, now() - interval '1 day'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 90, now() - interval '1 day' + interval '30 seconds'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 50, now() - interval '1 day' + interval '90 seconds');

-- a second check-in (no pings) so check_in_count = 2, distinct from the
-- 1 session that carries quiet minutes
insert into public.sessions (id, user_id, zone_id, start_ts, created_at) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '2 days', now() - interval '2 days');
-- a stale session OUTSIDE the window must NOT be counted
insert into public.sessions (id, user_id, zone_id, start_ts, created_at) values
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '30 days', now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- wallet_ledger accrual rows tagged to Zone A: 5 + 10 = 15 points in-window.
-- A row tagged to a DIFFERENT zone and a row with a different reason must both
-- be excluded, proving the zone+reason filter.
-- ---------------------------------------------------------------------------
insert into public.wallet_ledger (user_id, delta, reason, metadata, created_at) values
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 5, 'quiet_minute_accrual',
   jsonb_build_object('zone_id', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'), now() - interval '1 day'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 10, 'quiet_minute_accrual',
   jsonb_build_object('zone_id', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'), now() - interval '2 days'),
  -- different zone -> excluded
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 99, 'quiet_minute_accrual',
   jsonb_build_object('zone_id', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'), now() - interval '1 day'),
  -- different reason -> excluded
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 77, 'signup_bonus',
   jsonb_build_object('zone_id', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'), now() - interval '1 day'),
  -- in-zone, in-reason, but OUTSIDE window -> excluded
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 88, 'quiet_minute_accrual',
   jsonb_build_object('zone_id', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'), now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- redemptions for Zone A: 1 in-window, 1 stale (excluded). Needs a reward row.
-- ---------------------------------------------------------------------------
insert into public.rewards (id, zone_id, name, points_cost) values
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Free coffee', 50);
insert into public.redemptions (user_id, reward_id, zone_id, points_spent, created_at) values
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 50, now() - interval '1 day'),
  ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 50, now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- Assertions. The function guards on the passed operator_id arg, not the
-- session role, so we call it directly as postgres.
-- ---------------------------------------------------------------------------

select is(
  (public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->>'check_in_count')::int,
  2,
  'check_in_count counts only the two in-window sessions, not the stale one'
);

select is(
  (public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->>'total_quiet_minutes')::numeric,
  1.50,
  'total_quiet_minutes = 90s of gap-capped eligible time = 1.50, excluding the sub-threshold leading gap'
);

select is(
  (public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->>'total_points_accrued')::int,
  15,
  'total_points_accrued sums only in-window quiet_minute_accrual rows tagged to this zone (5+10)'
);

select is(
  (public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->>'redemption_count')::int,
  1,
  'redemption_count counts only the in-window redemption, not the stale one'
);

select is(
  jsonb_array_length(public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->'quiet_index_trend'),
  2,
  'quiet_index_trend has one entry per day with quiet_index rows in window (2 days)'
);

select is(
  (public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')->'peak_window'->>'max_active_count')::int,
  9,
  'peak_window reports the highest in-window active_count (9)'
);

-- IDOR negative (SR-7): operatorB must not be able to summarize zoneA.
select throws_ok(
  $$ select public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid) $$,
  'not_authorized',
  'an operator who does not own the zone cannot summarize it (IDOR guard)'
);

-- Anonymity: the seeded session-owner uuid must NOT appear anywhere in the
-- returned payload (privacy boundary -- no per-user identifier ever leaves).
select ok(
  position('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0' in
    public.zone_weekly_metrics('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0')::text) = 0,
  'no session-owner user_id leaks into the digest payload (anonymity boundary)'
);

select * from finish();
rollback;
