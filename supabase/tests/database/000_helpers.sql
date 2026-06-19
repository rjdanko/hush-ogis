-- supabase/tests/database/000_helpers.sql
create extension if not exists pgtap;

create schema if not exists tests;

create or replace function tests.create_test_user(p_id uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer set search_path = pg_catalog, auth
as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, is_sso_user, is_anonymous
  )
  values (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_id::text || '@test.local', '', now(), null, '', null,
    '', null, '', '',
    null, now(), '{}'::jsonb, '{}'::jsonb,
    false, now(), now(), false, false
  )
  on conflict (id) do nothing;
  return p_id;
end;
$$;

create or replace function tests.authenticate_as(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
