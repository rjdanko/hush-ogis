-- supabase/tests/database/022_delete_my_data.sql
-- Fixture tests for public.delete_my_data() (0025_delete_my_data.sql),
-- the right-to-erasure RPC (SR-12, PRD HR-P5). No id parameter -- the
-- function always acts on auth.uid(), so there is no IDOR surface via a
-- "wrong id" attempt; the IDOR-relevant assertion here is simply that
-- deleting your own data never touches another user's rows.
begin;
select plan(10);

select tests.create_test_user('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid); -- userA (deletes self)
select tests.create_test_user('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'::uuid); -- userB (must survive untouched)
select tests.create_test_user('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'::uuid); -- operator (operators.id -> users.id)

reset role;

insert into public.operators (id, venue_name) values
  ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Op')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence, reward_config) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Zone',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb)
on conflict do nothing;

insert into public.rewards (id, zone_id, name, points_cost) values
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'Free coffee', 50);

-- sessions for both users
insert into public.sessions (id, user_id, zone_id, start_ts, end_ts, intended_minutes, achieved_minutes, final_score) values
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', now() - interval '1 hour', now(), 30, 30, 90),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', now() - interval '1 hour', now(), 30, 30, 90);

-- score_pings for both users' sessions
insert into public.score_pings (session_id, ts, score) values
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', now(), 90),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', now(), 90);

-- wallet_ledger for both users
insert into public.wallet_ledger (user_id, delta, reason) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 100, 'quiet_minute_accrual'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 100, 'quiet_minute_accrual');

-- redemptions for both users
insert into public.redemptions (user_id, reward_id, zone_id, points_spent) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 50),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 50);

set local role authenticated;
select tests.authenticate_as('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid);

select lives_ok(
  $$ select public.delete_my_data() $$,
  'delete_my_data() executes without error for an authenticated user'
);

reset role;

select is(
  (select count(*)::int from public.users where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  0,
  'the caller''s own public.users row is removed'
);

select is(
  (select count(*)::int from public.sessions where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  0,
  'the caller''s sessions are removed via cascade'
);

select is(
  (select count(*)::int from public.score_pings where session_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  0,
  'the caller''s score_pings are removed via cascade through sessions'
);

select is(
  (select count(*)::int from public.wallet_ledger where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  0,
  'the caller''s wallet_ledger rows are removed via cascade'
);

select is(
  (select count(*)::int from public.redemptions where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  0,
  'the caller''s redemptions are removed via cascade'
);

-- IDOR guard: userB's rows across every table are completely untouched.
select is(
  (
    select count(*)::int from public.users where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'
  ) + (
    select count(*)::int from public.sessions where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'
  ) + (
    select count(*)::int from public.wallet_ledger where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'
  ) + (
    select count(*)::int from public.redemptions where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'
  ),
  4,
  'userB still has exactly 1 row in each of users/sessions/wallet_ledger/redemptions -- untouched by userA''s deletion (IDOR guard)'
);

-- Grants: anon must never be able to execute this; authenticated must.
select isnt(
  has_function_privilege('anon', 'public.delete_my_data()', 'execute'),
  true,
  'anon role has no execute grant on delete_my_data'
);

select is(
  has_function_privilege('authenticated', 'public.delete_my_data()', 'execute'),
  true,
  'authenticated role has an execute grant on delete_my_data'
);

-- Unauthenticated call (no JWT claims at all -> auth.uid() is null) must
-- raise, never silently no-op or delete under a null identity.
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.delete_my_data() $$,
  'not_authorized',
  'delete_my_data raises when called with no authenticated session (auth.uid() is null)'
);

select * from finish();
rollback;
