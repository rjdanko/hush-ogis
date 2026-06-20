begin;
select plan(5);

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
), (
  '50505050-5050-5050-5050-505050505051',
  '40404040-4040-4040-4040-404040404040',
  'Zone B',
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

-- a blocked INSERT has no existing row for RLS to silently filter -- the
-- WITH CHECK clause rejects the new row outright, which does raise 42501
-- (same reasoning as sessions/score_pings INSERT guards).
select throws_ok(
  $$ insert into public.rewards (zone_id, name, points_cost)
     values ('50505050-5050-5050-5050-505050505050', 'Free pastry', 10) $$,
  '42501',
  null,
  'operator B cannot insert a reward into operator A''s zone'
);

select results_eq(
  $$
    with deleted as (
      delete from public.rewards
      where id = '60606060-6060-6060-6060-606060606060'
      returning 1
    ) select count(*)::int from deleted
  $$,
  $$ select 0 $$,
  'operator B cannot delete operator A''s reward (IDOR guard: 0 rows affected)'
);

-- the owning operator (A, not B) tries to move their own reward into a zone
-- they don't own. USING alone would pass (A owns the pre-update row, via
-- its current zone_id) -- only a WITH CHECK on the post-update row catches
-- a reassignment to a zone owned by someone else.
select tests.authenticate_as('30303030-3030-3030-3030-303030303030'::uuid);

select throws_ok(
  $$ update public.rewards set zone_id = '50505050-5050-5050-5050-505050505051'
     where id = '60606060-6060-6060-6060-606060606060' $$,
  '42501',
  null,
  'operator A cannot reassign their own reward to operator B''s zone (WITH CHECK guard)'
);

select * from finish();
rollback;
