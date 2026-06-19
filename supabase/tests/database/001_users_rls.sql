-- supabase/tests/database/001_users_rls.sql
begin;
select plan(4);

select tests.create_test_user('11111111-1111-1111-1111-111111111111'::uuid);
select tests.create_test_user('22222222-2222-2222-2222-222222222222'::uuid);

set local role authenticated;
select tests.authenticate_as('11111111-1111-1111-1111-111111111111'::uuid);

select is(
  (select count(*)::int from public.users where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'user A can select own row (auto-provisioned by signup trigger)'
);

select is(
  (select count(*)::int from public.users where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'user A cannot select user B row (IDOR guard)'
);

select throws_ok(
  $$ update public.users set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001',
  null,
  'user A cannot self-promote role to admin (privilege escalation guard)'
);

select isnt(
  (select role::text from public.users where id = '11111111-1111-1111-1111-111111111111'),
  'admin',
  'role column was not changed by the blocked update'
);

select * from finish();
rollback;
