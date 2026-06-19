begin;
select plan(2);

select tests.create_test_user('70707070-7070-7070-7070-707070707070'::uuid);
select tests.create_test_user('80808080-8080-8080-8080-808080808080'::uuid);

reset role;
insert into public.wallet_ledger (user_id, delta, reason)
values ('70707070-7070-7070-7070-707070707070', 50, 'session reward');

set local role authenticated;
select tests.authenticate_as('80808080-8080-8080-8080-808080808080'::uuid);

select is(
  (select count(*)::int from public.wallet_ledger where user_id = '70707070-7070-7070-7070-707070707070'),
  0,
  'user B cannot read user A''s wallet ledger (IDOR guard)'
);

select throws_ok(
  $$ insert into public.wallet_ledger (user_id, delta, reason)
     values ('80808080-8080-8080-8080-808080808080', 1000, 'self credit') $$,
  '42501',
  null,
  'no client (not even the owning user) can credit/debit their own wallet directly — server-verified only (SR-8, risk R6)'
);

select * from finish();
rollback;
