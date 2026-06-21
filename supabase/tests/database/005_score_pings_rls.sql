-- supabase/tests/database/005_score_pings_rls.sql
begin;
select plan(2);

select tests.create_test_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select tests.create_test_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
insert into public.operators (id, venue_name) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, intended_minutes) values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  20
);
insert into public.score_pings (session_id, score) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 72);

set local role authenticated;
select tests.authenticate_as('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);

select is(
  (select count(*)::int from public.score_pings where session_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  0,
  'user B cannot read score_pings belonging to user A''s session (IDOR guard)'
);

-- NOTE: as of 0016_score_ping_ingest.sql, `insert` on score_pings is revoked
-- from `authenticated` entirely -- this now fails for *every* authenticated
-- user (not just user B) on the missing grant alone, before RLS is ever
-- evaluated, so this is no longer an IDOR guard. The real IDOR coverage for
-- the score-ping ingest path now lives in 012_score_ping_ingest.sql, which
-- exercises the ingest_score_ping RPC (the only remaining write path). This
-- assertion is kept only as a regression guard that direct inserts stay
-- blocked at all.
select throws_ok(
  $$ insert into public.score_pings (session_id, score)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 50) $$,
  '42501',
  null,
  'direct insert into score_pings remains blocked for any authenticated user'
);

select * from finish();
rollback;
