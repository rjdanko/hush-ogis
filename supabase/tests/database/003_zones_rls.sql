-- supabase/tests/database/003_zones_rls.sql
begin;
select plan(4);

select tests.create_test_user('55555555-5555-5555-5555-555555555555'::uuid);
select tests.create_test_user('66666666-6666-6666-6666-666666666666'::uuid);
insert into public.operators (id, venue_name) values
  ('55555555-5555-5555-5555-555555555555', 'Operator A'),
  ('66666666-6666-6666-6666-666666666666', 'Operator B')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence)
values (
  '77777777-7777-7777-7777-777777777777',
  '55555555-5555-5555-5555-555555555555',
  'Demo Cafe',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('66666666-6666-6666-6666-666666666666'::uuid);

select is(
  (select count(*)::int from public.zones where id = '77777777-7777-7777-7777-777777777777'),
  1,
  'any authenticated user can discover an operator-owned zone (public map discovery)'
);

-- RLS's USING clause silently filters rows the policy denies rather than
-- raising an error: operator B has the table-level GRANT (required for
-- operator A to update/delete their own rows), so an UPDATE/DELETE on a
-- row RLS hides from B succeeds as a statement but affects zero rows.
-- Postgres only raises 42501 (insufficient_privilege) when the GRANT itself
-- is missing, which is not the case here. We therefore assert the actual
-- security property -- zero rows affected -- instead of expecting a thrown
-- exception.
select results_eq(
  $$
    with updated as (
      update public.zones set name = 'Hijacked'
      where id = '77777777-7777-7777-7777-777777777777'
      returning 1
    ) select count(*)::int from updated
  $$,
  $$ select 0 $$,
  'operator B cannot update operator A''s zone (IDOR guard: 0 rows affected)'
);

select results_eq(
  $$
    with deleted as (
      delete from public.zones
      where id = '77777777-7777-7777-7777-777777777777'
      returning 1
    ) select count(*)::int from deleted
  $$,
  $$ select 0 $$,
  'operator B cannot delete operator A''s zone (IDOR guard: 0 rows affected)'
);

select isnt(
  (select name from public.zones where id = '77777777-7777-7777-7777-777777777777'),
  'Hijacked',
  'zone name was not changed by the blocked update'
);

select * from finish();
rollback;
