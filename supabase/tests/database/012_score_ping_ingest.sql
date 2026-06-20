-- supabase/tests/database/012_score_ping_ingest.sql
begin;
select plan(9);

select tests.create_test_user('99999999-9999-9999-9999-999999999999'::uuid);
select tests.create_test_user('88888888-8888-8888-8888-888888888888'::uuid);
insert into public.operators (id, venue_name) values ('99999999-9999-9999-9999-999999999999', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '99999999-9999-9999-9999-999999999999',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, anon_token) values (
  '32323232-3232-3232-3232-323232323232',
  '99999999-9999-9999-9999-999999999999',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '11111111-aaaa-aaaa-aaaa-111111111111'
);

set local role authenticated;
select tests.authenticate_as('99999999-9999-9999-9999-999999999999'::uuid);

select lives_ok(
  $$ select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 72, now()) $$,
  'owner can ingest a score ping with the correct anon_token + zone_id'
);

select ok(
  (select count(*) = 1 from public.score_pings where session_id = '32323232-3232-3232-3232-323232323232'),
  'ingest writes exactly one score_pings row resolved from the anon_token'
);

select throws_ok(
  $$ select public.ingest_score_ping('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 50, now()) $$,
  'P0002',
  null,
  'an unknown anon_token is rejected'
);

select throws_ok(
  $$ select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', '00000000-0000-0000-0000-000000000000', 50, now()) $$,
  'P0002',
  null,
  'the correct token with the wrong zone_id is rejected'
);

select throws_ok(
  $$ select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 150, now()) $$,
  'P0001',
  'score out of range',
  'an out-of-range score is rejected'
);

select tests.authenticate_as('88888888-8888-8888-8888-888888888888'::uuid);

select throws_ok(
  $$ select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 50, now()) $$,
  'P0002',
  null,
  'user B cannot ingest against user A''s session even with the right token (IDOR guard)'
);

select tests.authenticate_as('99999999-9999-9999-9999-999999999999'::uuid);

select throws_ok(
  $$ insert into public.score_pings (session_id, ts, score) values ('32323232-3232-3232-3232-323232323232', now(), 50) $$,
  '42501',
  null,
  'direct table insert is no longer permitted -- the RPC is the only ingest path'
);

select lives_ok(
  $$
    select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 60, now())
    from generate_series(1, 11)
  $$,
  'remaining pings up to the 12/60s limit succeed'
);

select throws_ok(
  $$ select public.ingest_score_ping('11111111-aaaa-aaaa-aaaa-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 60, now()) $$,
  'P0001',
  'rate limit exceeded: too many score pings, try again shortly',
  'the 13th ping in 60s is rate-limited (1 from earlier + 11 here = 12 already used)'
);

select * from finish();
rollback;
