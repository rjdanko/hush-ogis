-- supabase/tests/database/011_checkout_session.sql
begin;
select plan(4);

select tests.create_test_user('55555555-5555-5555-5555-555555555555'::uuid);
select tests.create_test_user('44444444-4444-4444-4444-444444444444'::uuid);
insert into public.operators (id, venue_name) values ('55555555-5555-5555-5555-555555555555', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '55555555-5555-5555-5555-555555555555',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  '12121212-1212-1212-1212-121212121212',
  '55555555-5555-5555-5555-555555555555',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  now() - interval '20 minutes'
);

set local role authenticated;
select tests.authenticate_as('44444444-4444-4444-4444-444444444444'::uuid);

select throws_ok(
  $$ select public.checkout_session('12121212-1212-1212-1212-121212121212') $$,
  'P0002',
  null,
  'user B cannot checkout user A''s session (IDOR guard)'
);

select tests.authenticate_as('55555555-5555-5555-5555-555555555555'::uuid);

select ok(
  (select achieved_minutes >= 19 and achieved_minutes <= 21
   from public.checkout_session('12121212-1212-1212-1212-121212121212')),
  'checkout computes achieved_minutes from elapsed start_ts (~20 min)'
);

select ok(
  (select end_ts is not null from public.sessions where id = '12121212-1212-1212-1212-121212121212'),
  'checkout sets end_ts'
);

select throws_ok(
  $$ select public.checkout_session('12121212-1212-1212-1212-121212121212') $$,
  'P0002',
  null,
  'a session already checked out cannot be checked out again'
);

select * from finish();
rollback;
