begin;
select plan(2);

select tests.create_test_user('90909090-9090-9090-9090-909090909090'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('90909090-9090-9090-9090-909090909090', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  '91919191-9191-9191-9191-919191919191',
  '90909090-9090-9090-9090-909090909090',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('90909090-9090-9090-9090-909090909090'::uuid);

-- this is the exact insert shape apps/mobile/lib/checkin.ts uses: no user_id
select lives_ok(
  $$ insert into public.sessions (zone_id, intended_minutes)
     values ('91919191-9191-9191-9191-919191919191', 20) $$,
  'a real check-in insert with no explicit user_id succeeds (DB default fills it)'
);

select is(
  (select user_id from public.sessions where zone_id = '91919191-9191-9191-9191-919191919191'),
  '90909090-9090-9090-9090-909090909090'::uuid,
  'the DB default fills user_id with auth.uid(), not null/another user'
);

select * from finish();
rollback;
