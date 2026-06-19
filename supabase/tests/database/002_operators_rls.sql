-- supabase/tests/database/002_operators_rls.sql
begin;
select plan(2);

select tests.create_test_user('33333333-3333-3333-3333-333333333333'::uuid);
select tests.create_test_user('44444444-4444-4444-4444-444444444444'::uuid);

insert into public.operators (id, venue_name)
values ('33333333-3333-3333-3333-333333333333', 'Demo Cafe Ops')
on conflict do nothing;

set local role authenticated;
select tests.authenticate_as('33333333-3333-3333-3333-333333333333'::uuid);

select is(
  (select venue_name from public.operators where id = '33333333-3333-3333-3333-333333333333'),
  'Demo Cafe Ops',
  'operator X can select own row'
);

select is(
  (select count(*)::int from public.operators where id = '44444444-4444-4444-4444-444444444444'),
  0,
  'operator X cannot select operator Y row (IDOR guard) — note: operator 44444444 has no operators row yet, this also covers the not-found case'
);

select * from finish();
rollback;
