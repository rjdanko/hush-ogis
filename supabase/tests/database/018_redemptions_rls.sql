begin;
select plan(3);

select tests.create_test_user('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid);
select tests.create_test_user('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.rewards (id, zone_id, name, points_cost) values (
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  'Free coffee',
  50
);
insert into public.redemptions (user_id, reward_id, zone_id, points_spent) values (
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  50
);

set local role authenticated;
select tests.authenticate_as('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'::uuid);

select is(
  (select count(*)::int from public.redemptions where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'),
  0,
  'user B cannot read user A''s redemptions (IDOR guard)'
);

select throws_ok(
  $$ insert into public.redemptions (user_id, reward_id, zone_id, points_spent)
     values ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 1) $$,
  '42501',
  null,
  'no client (not even the redeeming user) can insert a redemption directly -- server-verified only (SR-8/SR-13)'
);

select tests.authenticate_as('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid);

select is(
  (select points_spent from public.redemptions where reward_id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'),
  50,
  'the owning user can read their own redemption row'
);

select * from finish();
rollback;
