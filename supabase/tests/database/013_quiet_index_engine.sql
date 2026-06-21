-- supabase/tests/database/013_quiet_index_engine.sql
-- Fixture tests for public.compute_quiet_index_rollups() (0017_quiet_index_engine.sql).
-- Every case inserts known sessions/score_pings and asserts the exact resulting
-- quiet_index row (or its absence) -- this is the "pure, fixture-tested unit"
-- the PRD calls for, expressed as deterministic pgTAP cases since the engine
-- has to run inside Postgres against live data.
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change_token_new, email_change)
select
  ('70000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qi-fixture-' || n || '@test.local', '', now(), '{}'::jsonb, '{}'::jsonb,
  false, now(), now(), false, false, '', '', '', ''
from generate_series(1, 10) n
on conflict (id) do nothing;

select tests.create_test_user('71000000-0000-0000-0000-000000000000'::uuid);
insert into public.operators (id, venue_name) values
  ('71000000-0000-0000-0000-000000000000', 'QI Test Op')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000000', 'Zone Q1', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000000', 'Zone Q2 decay', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')),
  ('72000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000000', 'Zone Q3 stale', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')),
  ('72000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000000', 'Zone Q4 ended', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')),
  ('72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000000', 'Zone Q5 iso-a', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')),
  ('72000000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-000000000000', 'Zone Q6 iso-b', st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'));

-- ---------------------------------------------------------------------------
-- Case 1+2: quorum boundary (2 -> hidden, 3 -> shown) in Zone Q1
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001');
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000001', 90, now()),
  ('73000000-0000-0000-0000-000000000002', 90, now());

select public.compute_quiet_index_rollups();

select is(
  (select count(*)::int from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000001'),
  0,
  'quorum guard: 2 live sessions does not produce a quiet_index row'
);

insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001');
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000003', 90, now());

select public.compute_quiet_index_rollups();

select is(
  (select active_count from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000001' order by ts desc limit 1),
  3,
  'quorum guard: the 3rd live session produces a row with active_count = 3'
);

-- ---------------------------------------------------------------------------
-- Case 3: decay weighting -- one session's last ping is 30s old (2/3 through
-- the 45s active window), so its score counts for less than a fresh ping's.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000002'),
  ('73000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000002'),
  ('73000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000006', '72000000-0000-0000-0000-000000000002');
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000004', 100, now()),
  ('73000000-0000-0000-0000-000000000005', 100, now()),
  ('73000000-0000-0000-0000-000000000006', 40, now() - interval '30 seconds');

select public.compute_quiet_index_rollups();

-- weights ~= 1, 1, 1/3 -> value = (100+100+40/3) / (1+1+1/3) ~= 91.43;
-- round() (no decimal arg) tolerates the few ms of jitter between the insert
-- above and the function call without risking a boundary flake.
select is(
  (select round(value)::int from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000002' order by ts desc limit 1),
  91,
  'decay weighting: a 30s-stale ping pulls the weighted average toward fresher scores, not a plain average'
);

-- ---------------------------------------------------------------------------
-- Case 4: a ping older than the 45s active window doesn't count at all, so
-- only 2 of 3 sessions are "live" -- quorum is not met.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000007', '72000000-0000-0000-0000-000000000003'),
  ('73000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000003'),
  ('73000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-000000000009', '72000000-0000-0000-0000-000000000003');
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000007', 90, now()),
  ('73000000-0000-0000-0000-000000000008', 90, now()),
  ('73000000-0000-0000-0000-000000000009', 90, now() - interval '60 seconds');

select public.compute_quiet_index_rollups();

select is(
  (select count(*)::int from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000003'),
  0,
  'a stale (>45s) last ping does not count toward quorum, even though the session row exists'
);

-- ---------------------------------------------------------------------------
-- Case 5: a checked-out session (end_ts set) with a fresh ping is excluded
-- from the live count, even though it would otherwise look "live".
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', '72000000-0000-0000-0000-000000000004'),
  ('73000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000004'),
  ('73000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000004');
insert into public.sessions (id, user_id, zone_id, end_ts) values
  ('73000000-0000-0000-0000-000000000013', '70000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000004', now());
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000010', 90, now()),
  ('73000000-0000-0000-0000-000000000011', 90, now()),
  ('73000000-0000-0000-0000-000000000012', 90, now()),
  ('73000000-0000-0000-0000-000000000013', 90, now());

select public.compute_quiet_index_rollups();

select is(
  (select active_count from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000004' order by ts desc limit 1),
  3,
  'an ended session (end_ts set) is excluded from active_count even with a fresh trailing ping'
);

-- ---------------------------------------------------------------------------
-- Case 6+7: zone isolation -- one cron tick must compute each zone on its
-- own, not pool all live sessions globally.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, zone_id) values
  ('73000000-0000-0000-0000-000000000014', '70000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000005'),
  ('73000000-0000-0000-0000-000000000015', '70000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000005'),
  ('73000000-0000-0000-0000-000000000016', '70000000-0000-0000-0000-000000000006', '72000000-0000-0000-0000-000000000005'),
  ('73000000-0000-0000-0000-000000000017', '70000000-0000-0000-0000-000000000007', '72000000-0000-0000-0000-000000000006'),
  ('73000000-0000-0000-0000-000000000018', '70000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000006');
insert into public.score_pings (session_id, score, ts) values
  ('73000000-0000-0000-0000-000000000014', 90, now()),
  ('73000000-0000-0000-0000-000000000015', 90, now()),
  ('73000000-0000-0000-0000-000000000016', 90, now()),
  ('73000000-0000-0000-0000-000000000017', 90, now()),
  ('73000000-0000-0000-0000-000000000018', 90, now());

select public.compute_quiet_index_rollups();

select is(
  (select active_count from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000005' order by ts desc limit 1),
  3,
  'zone isolation: Q5 (3 live sessions) gets a row in the same tick as Q6'
);

select is(
  (select count(*)::int from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000006'),
  0,
  'zone isolation: Q6 (only 2 live sessions) gets no row even though Q5 met quorum in the same tick'
);

-- ---------------------------------------------------------------------------
-- Case 8: re-running the tick with the same still-live fixture appends a new
-- history row rather than upserting -- quiet_index is a time series. (Q1's
-- sessions are still live from cases 1-2, so every call above already added
-- a row for Q1 too -- this case only checks the *delta* of one more call,
-- not an absolute count, so it isn't coupled to how many earlier cases ran.)
-- ---------------------------------------------------------------------------
select count(*)::int as q1_count_before from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000001' \gset

select public.compute_quiet_index_rollups();

select is(
  (select count(*)::int from public.quiet_index where zone_id = '72000000-0000-0000-0000-000000000001'),
  :q1_count_before + 1,
  're-running the engine with the same live fixture appends exactly one more history row, not an upsert'
);

select * from finish();
rollback;
