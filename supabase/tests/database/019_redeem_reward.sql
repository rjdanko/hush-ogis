begin;
select plan(6);

select tests.create_test_user('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'::uuid);
select tests.create_test_user('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3',
  'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.rewards (id, zone_id, name, points_cost) values (
  'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3',
  'Free coffee',
  50
);
insert into public.wallet_ledger (user_id, delta, reason) values
  -- 200 covers 3 successful redemptions of this 50-point reward, so the
  -- 4th call below can isolate the rate-limit guard from the balance guard
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 200, 'quiet_minute_accrual'),
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 10, 'quiet_minute_accrual');

set local role authenticated;

-- insufficient balance
select tests.authenticate_as('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2'::uuid);
select throws_ok(
  $$ select public.redeem_reward('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4') $$,
  'P0001',
  'insufficient balance',
  'redeem_reward refuses when the user''s wallet balance is below the reward''s points_cost'
);

-- happy path: 1st of 3 successful redemptions
select tests.authenticate_as('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'::uuid);
select is(
  (select points_spent from public.redeem_reward('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4')),
  50,
  'redeem_reward returns a redemption row with points_spent = the reward''s points_cost'
);

select is(
  (select coalesce(sum(delta), 0)::int from public.wallet_ledger where user_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'),
  150,
  'the wallet balance reflects the debit (200 - 50 = 150)'
);

select is(
  (select count(*)::int from public.redemptions where user_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'),
  1,
  'a redemptions audit row was created'
);

-- 2nd and 3rd successful redemptions, still well within balance (150, 100 left)
select public.redeem_reward('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4');
select public.redeem_reward('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4');

-- 4th call within 60s: balance is still sufficient (50 left, cost is 50),
-- so this isolates the rate-limit guard from the balance guard
select throws_ok(
  $$ select public.redeem_reward('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4') $$,
  'P0001',
  'rate limit exceeded: too many redemptions, try again shortly',
  'a 4th redemption within 60s is blocked by the rate limit, not the balance check'
);

select tests.authenticate_as('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2'::uuid);
select throws_ok(
  $$ select public.redeem_reward('00000000-0000-0000-0000-000000000000') $$,
  'P0002',
  'reward not found',
  'redeem_reward rejects a reward id that does not exist'
);

select * from finish();
rollback;
