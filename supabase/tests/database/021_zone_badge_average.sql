-- supabase/tests/database/021_zone_badge_average.sql
-- Fixture tests for public.zone_badge_average() (0024_zone_badge_average.sql).
-- Same IDOR-guard-first pattern as zone_weekly_metrics (020): the badge value
-- is the ONE thing in the system that becomes publicly embeddable (via a
-- signed token minted from this number), so the ownership check must run
-- before a single quiet_index row is read.
begin;
select plan(4);

select tests.create_test_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'::uuid); -- operatorA
select tests.create_test_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid); -- operatorB

reset role;

insert into public.operators (id, venue_name) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Op A'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Op B')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence, reward_config) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Zone A',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Zone B (no quiet_index rows)',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb);

-- Zone A: two in-window rows (avg 80), one stale row OUTSIDE the 7-day window
-- that must be excluded from the average.
insert into public.quiet_index (zone_id, ts, value, active_count) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '1 day', 70, 5),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '2 days', 90, 5),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '30 days', 10, 5);

select is(
  public.zone_badge_average('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  80.0,
  'averages only the in-window quiet_index rows (70, 90), excluding the stale one'
);

select is(
  public.zone_badge_average('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'),
  null,
  'returns null (insufficient data) for a zone with no quiet_index history'
);

-- IDOR negative (SR-7): operatorB must not be able to read zoneA's average.
select throws_ok(
  $$ select public.zone_badge_average('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid) $$,
  'not_authorized',
  'an operator who does not own the zone cannot read its badge average (IDOR guard)'
);

-- Grants: only service_role may execute this function directly.
select isnt(
  has_function_privilege('authenticated', 'public.zone_badge_average(uuid,uuid)', 'execute'),
  true,
  'authenticated role has no execute grant on zone_badge_average (service_role only)'
);

select * from finish();
rollback;
