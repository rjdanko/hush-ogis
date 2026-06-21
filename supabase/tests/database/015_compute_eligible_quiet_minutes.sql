begin;
select plan(3);

select tests.create_test_user('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
  '2026-01-01T00:00:00Z'
);

-- 5 pings, 4 gaps of 300s (5 min) each, scores 80/85/60/90/95. min_score=70.
-- gap1 (80->t+300, eligible) capped at 60s = 1 min
-- gap2 (85->t+600, eligible) capped at 60s = 1 min
-- gap3 (60->t+900, NOT eligible, score below threshold) = 0
-- gap4 (90->t+1200, eligible) capped at 60s = 1 min
-- last ping (95) has no next ping, contributes nothing
-- total = 3 minutes
insert into public.score_pings (session_id, ts, score) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:00:00Z', 80),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:05:00Z', 85),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:10:00Z', 60),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:15:00Z', 90),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:20:00Z', 95);

select is(
  public.compute_eligible_quiet_minutes('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'::uuid, 70),
  3.0::numeric,
  'eligible minutes = sum of capped gaps following a score >= threshold (long gaps capped at 60s)'
);

select is(
  public.compute_eligible_quiet_minutes('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'::uuid, 100),
  0.0::numeric,
  'a threshold higher than every score yields zero eligible minutes'
);

select is(
  public.compute_eligible_quiet_minutes('00000000-0000-0000-0000-000000000000'::uuid, 0),
  0.0::numeric,
  'a session with no score_pings yields zero eligible minutes, not null/error'
);

select * from finish();
rollback;
