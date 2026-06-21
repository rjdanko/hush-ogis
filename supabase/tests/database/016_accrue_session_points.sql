begin;
select plan(6);

select tests.create_test_user('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence, reward_config) values (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
  '{"earn_rate_per_quiet_minute": 2, "min_score_for_earning": 70, "daily_point_cap": 5}'::jsonb
);

-- active (not yet checked out) session -- accrual must refuse to run early
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '2026-01-01T00:00:00Z'
);

select is(
  public.accrue_session_points('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3'::uuid),
  0,
  'accrual refuses to credit a session that has not been checked out yet (end_ts is null)'
);

select is(
  (select count(*)::int from public.wallet_ledger where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
  0,
  'no ledger row was written for the still-active session'
);

-- checked-out session, 5 pings 60s apart all scoring 80 (>= threshold 70):
-- 4 gaps x 60s (no capping at exactly 60s) = 4 eligible minutes
-- raw points = 4 * earn_rate(2) = 8, clamped to daily_point_cap(5) = 5
insert into public.sessions (id, user_id, zone_id, start_ts, end_ts) values (
  'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:04:00Z'
);
insert into public.score_pings (session_id, ts, score) values
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:00:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:01:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:02:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:03:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:04:00Z', 80);

select is(
  public.accrue_session_points('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'::uuid),
  5,
  'points are earn_rate x eligible minutes, clamped to the zone daily_point_cap'
);

select is(
  (select delta from public.wallet_ledger where metadata->>'session_id' = 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'),
  5,
  'the credited amount is written to wallet_ledger as a positive delta'
);

select is(
  public.accrue_session_points('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'::uuid),
  0,
  'calling accrual again on an already-credited session is a no-op (idempotent, no double-credit)'
);

select is(
  (select count(*)::int from public.wallet_ledger where metadata->>'session_id' = 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'),
  1,
  'exactly one ledger row exists for the session even after calling accrual twice'
);

select * from finish();
rollback;
