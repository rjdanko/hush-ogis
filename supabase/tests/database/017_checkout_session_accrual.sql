begin;
select plan(3);

select tests.create_test_user('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence, reward_config) values (
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
  '{"earn_rate_per_quiet_minute": 1, "min_score_for_earning": 50, "daily_point_cap": 100}'::jsonb
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  '2026-01-01T00:00:00Z'
);
insert into public.score_pings (session_id, ts, score) values
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', '2026-01-01T00:00:00Z', 60),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', '2026-01-01T00:01:00Z', 80);

set local role authenticated;
select tests.authenticate_as('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid);

select ok(
  (select final_score = 70 from public.checkout_session('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')),
  'checkout_session sets final_score to the average of this session''s score_pings'
);

select is(
  (select delta from public.wallet_ledger where metadata->>'session_id' = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  1,
  'checking out triggers accrual: 1 eligible minute (60->80, both >= 50) x earn_rate 1 = 1 point'
);

select is(
  (select count(*)::int from public.wallet_ledger where metadata->>'session_id' = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  1,
  'exactly one ledger row was created by this single checkout'
);

select * from finish();
rollback;
