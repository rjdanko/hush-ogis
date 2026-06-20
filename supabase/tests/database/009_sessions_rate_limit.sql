-- supabase/tests/database/009_sessions_rate_limit.sql
begin;
select plan(2);

select tests.create_test_user('77777777-7777-7777-7777-777777777777'::uuid);
insert into public.operators (id, venue_name) values ('77777777-7777-7777-7777-777777777777', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '77777777-7777-7777-7777-777777777777',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('77777777-7777-7777-7777-777777777777'::uuid);

-- 5 inserts in the same window succeed (at the limit, not over it).
select lives_ok(
  $$
    insert into public.sessions (user_id, zone_id)
    select '77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    from generate_series(1, 5)
  $$,
  'first 5 check-ins within the window succeed'
);

-- the 6th insert in the same 60s window is rejected.
select throws_ok(
  $$ insert into public.sessions (user_id, zone_id)
     values ('77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'P0001',
  'rate limit exceeded: too many check-ins, try again shortly',
  '6th check-in within 60s is rate-limited'
);

select * from finish();
rollback;
