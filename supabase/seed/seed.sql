-- supabase/seed/seed.sql
-- Demo operator + demo zone for downstream phases (Phase 2 dashboard, Phase 3 mobile map).
-- Demo login: demo-operator@hush.local / DemoOperator123! (local-only; never used outside this seed).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo-operator@hush.local',
  extensions.crypt('DemoOperator123!', extensions.gen_salt('bf')),
  now(), '{}'::jsonb, '{}'::jsonb,
  false, now(), now(), false, false,
  '', '', '', ''
)
on conflict (id) do update set encrypted_password = excluded.encrypted_password;

insert into public.operators (id, venue_name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Cafe')
on conflict (id) do update set venue_name = excluded.venue_name;

update public.users set role = 'operator'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.zones (id, operator_id, name, geofence, silence_contract, reward_config)
values (
  '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-000000000001',
  'Demo Cafe',
  st_geogfromtext('POLYGON((121.05 14.55, 121.05 14.56, 121.06 14.56, 121.06 14.55, 121.05 14.55))'),
  '{"suggested_minutes": 45}'::jsonb,
  '{"earn_rate_per_quiet_minute": 1, "min_score_for_earning": 70, "daily_point_cap": 120}'::jsonb
)
on conflict (id) do update set geofence = excluded.geofence;

-- fixed id (matching the operator/zone rows above) so re-running this seed
-- outside of `db reset` doesn't insert a duplicate row -- gen_random_uuid()
-- never collides with itself, so `on conflict do nothing` without an explicit
-- id was not actually idempotent.
insert into public.rewards (id, zone_id, name, points_cost)
values (
  '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000a',
  'Free coffee',
  50
)
on conflict (id) do update set points_cost = excluded.points_cost;
