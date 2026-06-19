begin;
select plan(2);

select tests.create_test_user('30303030-3030-3030-3030-303030303030'::uuid);
select tests.create_test_user('40404040-4040-4040-4040-404040404040'::uuid);
insert into public.operators (id, venue_name) values
  ('30303030-3030-3030-3030-303030303030', 'Operator A'),
  ('40404040-4040-4040-4040-404040404040', 'Operator B')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  '50505050-5050-5050-5050-505050505050',
  '30303030-3030-3030-3030-303030303030',
  'Zone A',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.rewards (id, zone_id, name, points_cost) values (
  '60606060-6060-6060-6060-606060606060',
  '50505050-5050-5050-5050-505050505050',
  'Free coffee',
  50
);

set local role authenticated;
select tests.authenticate_as('40404040-4040-4040-4040-404040404040'::uuid);

select is(
  (select name from public.rewards where id = '60606060-6060-6060-6060-606060606060'),
  'Free coffee',
  'any authenticated user can browse rewards for any zone (wallet redemption screen)'
);

-- NOTE (learned in Task 5/zones): an UPDATE blocked purely by a USING clause on an
-- existing row does not raise 42501 — operator B holds the same table-level UPDATE
-- grant operator A needs for their own writes, so RLS silently filters the row out
-- of the statement's target set instead of erroring. throws_ok(...,'42501',...) would
-- be a false negative here. Assert the real security property instead: 0 rows affected.
select results_eq(
  $$
    with updated as (
      update public.rewards set points_cost = 1
      where id = '60606060-6060-6060-6060-606060606060'
      returning 1
    ) select count(*)::int from updated
  $$,
  $$ select 0 $$,
  'operator B cannot edit operator A''s reward (IDOR guard: 0 rows affected)'
);

select * from finish();
rollback;
