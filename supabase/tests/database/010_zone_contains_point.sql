-- supabase/tests/database/010_zone_contains_point.sql
begin;
select plan(3);

select tests.create_test_user('66666666-6666-6666-6666-666666666666'::uuid);
insert into public.operators (id, venue_name) values ('66666666-6666-6666-6666-666666666666', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '66666666-6666-6666-6666-666666666666',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('66666666-6666-6666-6666-666666666666'::uuid);

select ok(
  (select public.zone_contains_point('dddddddd-dddd-dddd-dddd-dddddddddddd', 5, 5)),
  'a point well inside the polygon returns true (note: lat=5, lng=5)'
);

select ok(
  not (select public.zone_contains_point('dddddddd-dddd-dddd-dddd-dddddddddddd', 50, 50)),
  'a point well outside the polygon returns false'
);

select is(
  (select public.zone_contains_point('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 5, 5)),
  null,
  'an unknown zone id returns null (no row), not an error'
);

select * from finish();
rollback;
