-- supabase/tests/database/006_quiet_index_rls.sql
begin;
select plan(2);

select tests.create_test_user('10101010-1010-1010-1010-101010101010'::uuid);
insert into public.operators (id, venue_name) values ('10101010-1010-1010-1010-101010101010', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  '20202020-2020-2020-2020-202020202020',
  '10101010-1010-1010-1010-101010101010',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('10101010-1010-1010-1010-101010101010'::uuid);

select throws_ok(
  $$ insert into public.quiet_index (zone_id, value, active_count)
     values ('20202020-2020-2020-2020-202020202020', 80, 5) $$,
  '42501',
  null,
  'no authenticated client (including the owning operator) can write quiet_index directly — server-only via service_role'
);

reset role;
insert into public.quiet_index (zone_id, value, active_count)
values ('20202020-2020-2020-2020-202020202020', 80, 5);

set local role authenticated;
select tests.authenticate_as('10101010-1010-1010-1010-101010101010'::uuid);

select is(
  (select value::int from public.quiet_index where zone_id = '20202020-2020-2020-2020-202020202020'),
  80,
  'any authenticated user can read the published quiet_index (public live score)'
);

select * from finish();
rollback;
