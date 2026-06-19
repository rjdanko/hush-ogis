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
insert into public.sessions (id, user_id, zone_id, committed_minutes) values (
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

select throws_ok(
  $$ insert into public.score_pings (session_id, score)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 50) $$,
  '42501',
  null,
  'user B cannot insert a score_ping into user A''s session'
);

select * from finish();
rollback;
