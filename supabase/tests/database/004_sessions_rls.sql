-- supabase/tests/database/004_sessions_rls.sql
begin;
select plan(2);

select tests.create_test_user('88888888-8888-8888-8888-888888888888'::uuid);
select tests.create_test_user('99999999-9999-9999-9999-999999999999'::uuid);
insert into public.operators (id, venue_name) values ('88888888-8888-8888-8888-888888888888', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '88888888-8888-8888-8888-888888888888',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, committed_minutes) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '88888888-8888-8888-8888-888888888888',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  20
);

set local role authenticated;
select tests.authenticate_as('99999999-9999-9999-9999-999999999999'::uuid);

select is(
  (select count(*)::int from public.sessions where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'user B cannot read user A''s session (IDOR guard)'
);

select throws_ok(
  $$ insert into public.sessions (user_id, zone_id, committed_minutes)
     values ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10) $$,
  '42501',
  null,
  'user B cannot create a session on behalf of user A'
);

select * from finish();
rollback;
