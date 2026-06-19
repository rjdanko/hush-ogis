# Phase 1 — Data Layer, Auth & Security Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full Hush data model (PRD §9.2) in Supabase Postgres with Row-Level Security enforced on every table, a `user`/`operator`/`admin` role model, a demo seed, and `packages/shared-types` generated from the schema — so every later phase inherits IDOR/authz protection for free.

**Architecture:** All schema lives in versioned SQL migrations under `supabase/migrations/`, applied to a local Supabase stack (`supabase start`, Docker-backed Postgres 15 + PostGIS + GoTrue Auth + Realtime). Every table gets `alter table ... enable row level security` plus explicit policies in the **same migration** that creates it — RLS is never bolted on afterward. RLS is tested with **pgTAP** (`supabase test db`), writing one positive ("owner can access own row") and one negative ("other user/operator is denied" — the IDOR guard) test per table, run against a real Postgres instance with `auth.uid()` simulated via `request.jwt.claims`. `packages/shared-types` is hand-authored to mirror the migrations (no live codegen tool in this environment) and is the single source of truth for `Zone`/`Session`/`ScorePing`/etc. consumed by mobile + dashboard later.

**Tech Stack:** Supabase CLI 2.x (local Docker stack: Postgres 15, PostGIS, GoTrue, PostgREST, Realtime) · pgTAP (RLS tests via `supabase test db`) · TypeScript (`packages/shared-types`).

**Environment notes (verified this session):** Supabase CLI installed as a root devDependency (`npx supabase --version` → 2.107.0). Docker Desktop was not running; it was started and the daemon now responds to `docker ps`. `supabase start` is pulling its Docker images (Postgres/GoTrue/PostgREST/Realtime/Studio/etc.) for the first time — this can take several minutes on first run; **Task 1, Step 1 re-confirms the stack is actually up before any migration work begins.**

---

## File structure produced by this plan

```
supabase/
├─ config.toml                          # extended with [auth] local settings
├─ migrations/
│  ├─ 0001_enable_postgis.sql           # (exists from Phase 0)
│  ├─ 0002_roles_and_users.sql
│  ├─ 0003_operators.sql
│  ├─ 0004_zones.sql
│  ├─ 0005_sessions.sql
│  ├─ 0006_score_pings.sql
│  ├─ 0007_quiet_index.sql
│  ├─ 0008_rewards.sql
│  └─ 0009_wallet_ledger.sql
├─ tests/
│  └─ database/
│     ├─ 000_helpers.sql                # tests schema + create_test_user() fixture helper
│     ├─ 001_users_rls.sql
│     ├─ 002_operators_rls.sql
│     ├─ 003_zones_rls.sql
│     ├─ 004_sessions_rls.sql
│     ├─ 005_score_pings_rls.sql
│     ├─ 006_quiet_index_rls.sql
│     ├─ 007_rewards_rls.sql
│     └─ 008_wallet_ledger_rls.sql
└─ seed/
   └─ seed.sql                          # demo operator + demo zone (replaces P0 placeholder)
packages/shared-types/src/
├─ zone.ts
├─ session.ts
├─ score-ping.ts
├─ quiet-index.ts
├─ reward.ts
├─ wallet-ledger.ts
├─ user.ts
├─ operator.ts
└─ index.ts                             # re-exports all of the above
.env.example                            # appended with local Supabase stack values (SR-2 stays satisfied: anon key only documented as example)
```

---

## Task 1: Confirm the local Supabase stack is running

**Files:** none (verification only)

- [ ] **Step 1: Confirm `supabase start` finished successfully**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase status
```
Expected: a table of running services (`API URL`, `DB URL`, `Studio URL`, `anon key`, `service_role key`, etc.) with no "stopped" or error lines. If this errors with "not running", run `npx supabase start` (first run pulls Docker images and can take several minutes) and re-check with `npx supabase status`.

- [ ] **Step 2: Note the local credentials for `.env`**

Run:
```bash
npx supabase status -o env
```
Expected: lines like `API_URL="http://127.0.0.1:54321"`, `ANON_KEY="..."`, `SERVICE_ROLE_KEY="..."`. Keep this output for Task 9 — do not commit it anywhere; `.env` itself stays git-ignored (SR-2).

- [ ] **Step 3: Confirm PostGIS is enabled (carried over from Phase 0)**

Run:
```bash
npx supabase db diff --schema public
```
Expected: no errors (this confirms migrations apply cleanly so far). If PostGIS isn't enabled for some reason, re-run `npx supabase db reset` to replay `0001_enable_postgis.sql`.

---

## Task 2: Test helper schema + fixture function

pgTAP tests need a way to create a row in `auth.users` that satisfies GoTrue's schema, because every `public` table in this phase has a foreign key chain back to `auth.users(id)`. Build this helper once, in its own file, before any table exists.

**Files:**
- Create: `supabase/tests/database/000_helpers.sql`

- [ ] **Step 1: Write the helper fixture file**

```sql
-- supabase/tests/database/000_helpers.sql
create extension if not exists pgtap;

create schema if not exists tests;

create or replace function tests.create_test_user(p_id uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
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
```

- [ ] **Step 2: Run the helper file standalone to verify the `auth.users` insert matches this GoTrue schema version**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase db reset
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)" -f supabase/tests/database/000_helpers.sql -c "select tests.create_test_user();"
```
Expected: `CREATE EXTENSION`, `CREATE SCHEMA`, `CREATE FUNCTION` x2, then a returned uuid with no constraint-violation error. **If Postgres reports a `null value in column "X" violates not-null constraint` or `column "X" does not exist`,** adjust the column list/values in the `insert into auth.users (...)` statement to match the error (add the missing column with a sensible default, or drop a column name that doesn't exist in this GoTrue version), save the file, and re-run this exact command until it succeeds. This is expected first-run troubleshooting — GoTrue's `auth.users` shape varies slightly by version.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/000_helpers.sql
git commit -m "test: add pgTAP test-user fixture helper for RLS tests"
```

---

## Task 3: Roles enum + `users` table + RLS (SR-7, SR-8)

**Files:**
- Create: `supabase/migrations/0002_roles_and_users.sql`
- Create: `supabase/tests/database/001_users_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/001_users_rls.sql
begin;
select plan(5);

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

-- a direct superuser session (no JWT claims, auth.role() is null -- the
-- shape of supabase/seed/seed.sql's own role-promotion update) must still be
-- able to change role; only authenticated/anon clients are blocked. Pin this
-- down so a future tightening of the trigger can't silently break seeding
-- without a test pointing at the cause.
-- `reset role` alone is not enough: request.jwt.claims was set with
-- is_local=true (transaction-scoped), so it survives a role switch -- it
-- must be cleared explicitly or auth.role() still reads the earlier claim.
reset role;
select set_config('request.jwt.claims', '', true);
update public.users set role = 'operator' where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select role::text from public.users where id = '22222222-2222-2222-2222-222222222222'),
  'operator',
  'a superuser/seed session (auth.role() is null) can still change role'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails (table doesn't exist yet)**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase test db
```
Expected: FAIL — `relation "public.users" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0002_roles_and_users.sql
create type public.user_role as enum ('user', 'operator', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  anon_handle text not null,
  role public.user_role not null default 'user',
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select using (id = auth.uid());

create policy "users_update_own" on public.users
  for update using (id = auth.uid());

create policy "users_insert_own" on public.users
  for insert with check (id = auth.uid());

-- privilege-escalation guard: only service_role may change a user's role
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'role changes must go through a server-verified process';
  end if;
  return new;
end;
$$;

create trigger users_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_self_escalation();

-- auto-provision a public.users row whenever a new auth.users row is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, anon_handle)
  values (new.id, 'anon-' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: Apply migrations and run the test again**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 4/4 assertions ok for `001_users_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_roles_and_users.sql supabase/tests/database/001_users_rls.sql
git commit -m "feat(db): add user_role enum, users table, RLS, and role-escalation guard"
```

---

## Task 4: `operators` table + RLS (SR-7, SR-8)

**Files:**
- Create: `supabase/migrations/0003_operators.sql`
- Create: `supabase/tests/database/002_operators_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.operators" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0003_operators.sql
create table public.operators (
  id uuid primary key references auth.users(id) on delete cascade,
  venue_name text not null,
  badge_token text,
  created_at timestamptz not null default now()
);

alter table public.operators enable row level security;

create policy "operators_select_own" on public.operators
  for select using (id = auth.uid());

create policy "operators_update_own" on public.operators
  for update using (id = auth.uid());

create policy "operators_insert_own" on public.operators
  for insert with check (id = auth.uid());
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 2/2 assertions ok for `002_operators_rls.sql` (and `001_users_rls.sql` still green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_operators.sql supabase/tests/database/002_operators_rls.sql
git commit -m "feat(db): add operators table and owner-scoped RLS"
```

---

## Task 5: `zones` table (PostGIS polygon) + RLS (SR-6, SR-7)

**Files:**
- Create: `supabase/migrations/0004_zones.sql`
- Create: `supabase/tests/database/003_zones_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
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

select throws_ok(
  $$ update public.zones set name = 'Hijacked' where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'operator B cannot update operator A''s zone (IDOR guard)'
);

select throws_ok(
  $$ delete from public.zones where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'operator B cannot delete operator A''s zone'
);

select isnt(
  (select name from public.zones where id = '77777777-7777-7777-7777-777777777777'),
  'Hijacked',
  'zone name was not changed by the blocked update'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.zones" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0004_zones.sql
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  name text not null,
  geofence geography(Polygon, 4326) not null,
  silence_contract jsonb not null default '{}'::jsonb,
  reward_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zones_geofence_vertex_cap check (st_npoints(geofence::geometry) <= 64)
);

create index zones_geofence_gix on public.zones using gist (geofence);

alter table public.zones enable row level security;

-- zone discovery is public for any signed-in user (map screen, U1)
create policy "zones_select_all_authenticated" on public.zones
  for select to authenticated using (true);

create policy "zones_insert_own" on public.zones
  for insert with check (operator_id = auth.uid());

create policy "zones_update_own" on public.zones
  for update using (operator_id = auth.uid());

create policy "zones_delete_own" on public.zones
  for delete using (operator_id = auth.uid());
```

Note: `zones_geofence_vertex_cap` is the server-side polygon vertex cap called out in Phase 2's SR-4 task — defining it here, at table-creation time, means Phase 2 inherits it for free instead of bolting it on later. All geometry comparisons use bound parameters (`st_geogfromtext`, PostGIS operators) — never string-interpolated coordinates (SR-6).

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 4/4 assertions ok for `003_zones_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_zones.sql supabase/tests/database/003_zones_rls.sql
git commit -m "feat(db): add zones table with PostGIS polygon, vertex cap, and owner-scoped RLS"
```

---

## Task 6: `sessions` table + RLS (SR-7)

**Files:**
- Create: `supabase/migrations/0005_sessions.sql`
- Create: `supabase/tests/database/004_sessions_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/004_sessions_rls.sql
begin;
select plan(3);

select tests.create_test_user('88888888-8888-8888-8888-888888888888'::uuid);
select tests.create_test_user('99999999-9999-9999-9999-999999999999'::uuid);
insert into public.operators (id, venue_name) values ('88888888-8888-8888-8888-888888888888', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '88888888-8888-8888-8888-888888888888',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, committed_minutes) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '88888888-8888-8888-8888-888888888888',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  20
);

set local role authenticated;
select tests.authenticate_as('99999999-9999-9999-9999-999999999999'::uuid);

select is(
  (select count(*)::int from public.sessions where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'user B cannot read user A''s session (IDOR guard)'
);

select throws_ok(
  $$ insert into public.sessions (user_id, zone_id, committed_minutes)
     values ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10) $$,
  '42501',
  null,
  'user B cannot create a session on behalf of user A'
);

-- UPDATE blocked by a USING clause on an existing row is silently filtered
-- by RLS (0 rows affected), not a thrown exception -- same semantics as the
-- zones table's UPDATE/DELETE IDOR tests. Assert the real security property.
select results_eq(
  $$
    with updated as (
      update public.sessions set committed_minutes = 1
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      returning 1
    ) select count(*)::int from updated
  $$,
  $$ select 0 $$,
  'user B cannot update user A''s session (IDOR guard: 0 rows affected)'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.sessions" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0005_sessions.sql
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  start_ts timestamptz not null default now(),
  end_ts timestamptz,
  -- max 8 hours: longest plausible single silence commitment
  committed_minutes int not null check (committed_minutes > 0 and committed_minutes <= 480),
  achieved_minutes int check (achieved_minutes >= 0),
  final_score int check (final_score between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match).
grant select, insert, update on public.sessions to authenticated;

create policy "sessions_select_own" on public.sessions
  for select using (user_id = auth.uid());

create policy "sessions_insert_own" on public.sessions
  for insert with check (user_id = auth.uid());

-- no explicit WITH CHECK: Postgres reuses the USING expression for
-- WITH CHECK on UPDATE policies, so this also blocks reassigning
-- user_id to another user on update.
create policy "sessions_update_own" on public.sessions
  for update using (user_id = auth.uid());
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 3/3 assertions ok for `004_sessions_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_sessions.sql supabase/tests/database/004_sessions_rls.sql
git commit -m "feat(db): add sessions table with owner-scoped RLS"
```

---

## Task 7: `score_pings` table + RLS (SR-7, ties to SR-9 minimal-ingest)

**Files:**
- Create: `supabase/migrations/0006_score_pings.sql`
- Create: `supabase/tests/database/005_score_pings_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/005_score_pings_rls.sql
begin;
select plan(2);

select tests.create_test_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select tests.create_test_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
insert into public.operators (id, venue_name) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, committed_minutes) values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  20
);
insert into public.score_pings (session_id, score) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 72);

set local role authenticated;
select tests.authenticate_as('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);

select is(
  (select count(*)::int from public.score_pings where session_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  0,
  'user B cannot read score_pings belonging to user A''s session (IDOR guard)'
);

select throws_ok(
  $$ insert into public.score_pings (session_id, score)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 50) $$,
  '42501',
  null,
  'user B cannot insert a score_ping into user A''s session'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.score_pings" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0006_score_pings.sql
create table public.score_pings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  score int not null check (score between 0 and 100)
);

alter table public.score_pings enable row level security;

create policy "score_pings_select_own" on public.score_pings
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = score_pings.session_id and s.user_id = auth.uid()
    )
  );

create policy "score_pings_insert_own" on public.score_pings
  for insert with check (
    exists (
      select 1 from public.sessions s
      where s.id = score_pings.session_id and s.user_id = auth.uid()
    )
  );
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 2/2 assertions ok for `005_score_pings_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_score_pings.sql supabase/tests/database/005_score_pings_rls.sql
git commit -m "feat(db): add score_pings table scoped via owning session's user"
```

---

## Task 8: `quiet_index` table + RLS (SR-10 groundwork — public read, no client writes)

**Files:**
- Create: `supabase/migrations/0007_quiet_index.sql`
- Create: `supabase/tests/database/006_quiet_index_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/006_quiet_index_rls.sql
begin;
select plan(3);

select tests.create_test_user('10101010-1010-1010-1010-101010101010'::uuid);
insert into public.operators (id, venue_name) values ('10101010-1010-1010-1010-101010101010', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  '20202020-2020-2020-2020-202020202020',
  '10101010-1010-1010-1010-101010101010',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('10101010-1010-1010-1010-101010101010'::uuid);

select throws_ok(
  $$ insert into public.quiet_index (zone_id, value, active_count)
     values ('20202020-2020-2020-2020-202020202020', 80, 5) $$,
  '42501',
  null,
  'no authenticated client (including the owning operator) can write quiet_index directly — server-only via service_role'
);

reset role;
insert into public.quiet_index (zone_id, value, active_count)
values ('20202020-2020-2020-2020-202020202020', 80, 5);

set local role authenticated;
select tests.authenticate_as('10101010-1010-1010-1010-101010101010'::uuid);

select is(
  (select value::int from public.quiet_index where zone_id = '20202020-2020-2020-2020-202020202020'),
  80,
  'any authenticated user can read the published quiet_index (public live score)'
);

-- TRUNCATE is not subject to RLS at all (Postgres never evaluates RLS
-- policies for TRUNCATE) and Supabase's default ACL for the `postgres` role
-- silently grants it on every new table to anon/authenticated. Confirm the
-- revoke in this migration actually closes that hole.
select throws_ok(
  $$ truncate public.quiet_index $$,
  '42501',
  null,
  'no authenticated client can TRUNCATE quiet_index (bypasses RLS entirely if not explicitly revoked)'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.quiet_index" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0007_quiet_index.sql
create table public.quiet_index (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  ts timestamptz not null default now(),
  value numeric not null check (value between 0 and 100),
  active_count int not null check (active_count >= 0)
);

alter table public.quiet_index enable row level security;

-- public read: app map + dashboard live feed both display this
grant select on public.quiet_index to authenticated;

create policy "quiet_index_select_all" on public.quiet_index
  for select to authenticated using (true);

-- deliberately no insert/update/delete grant or policy: only service_role
-- (bypasses RLS and grants entirely) may write rollups, enforced server-side
-- by the Phase 5 aggregation engine (SR-10)

-- TRUNCATE bypasses Row-Level Security entirely (Postgres never evaluates RLS
-- policies for TRUNCATE), so a table can be fully wiped by any role holding
-- the TRUNCATE privilege regardless of its RLS policies or the absence of
-- insert/update/delete grants. The local stack's default ACL for the
-- `postgres` role (the role our migrations run as) silently grants TRUNCATE
-- on every newly created public table to `anon`/`authenticated` alongside
-- references/trigger, with no explicit GRANT statement anywhere in this
-- repo's migrations. This is a quiet_index-specific landmine (SR-10 depends
-- on this table being fully unwritable by any client) but the underlying
-- default ACL gap affects every public table created so far, so the fix is
-- applied once, here, for all of them, plus the default itself so Tasks 9+
-- don't reintroduce it on new tables.
revoke truncate on public.users from anon, authenticated;
revoke truncate on public.operators from anon, authenticated;
revoke truncate on public.zones from anon, authenticated;
revoke truncate on public.sessions from anon, authenticated;
revoke truncate on public.score_pings from anon, authenticated;
revoke truncate on public.quiet_index from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 3/3 assertions ok for `006_quiet_index_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_quiet_index.sql supabase/tests/database/006_quiet_index_rls.sql
git commit -m "feat(db): add quiet_index table — public read, service-role-only writes"
```

---

## Task 9: `rewards` table + RLS (SR-7, SR-8)

**Files:**
- Create: `supabase/migrations/0008_rewards.sql`
- Create: `supabase/tests/database/007_rewards_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/007_rewards_rls.sql
begin;
select plan(4);

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

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.rewards" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0008_rewards.sql
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  points_cost int not null check (points_cost > 0),
  created_at timestamptz not null default now()
);

alter table public.rewards enable row level security;

grant select, insert, update, delete on public.rewards to authenticated;

create policy "rewards_select_all" on public.rewards
  for select to authenticated using (true);

-- split per-operation (rather than one FOR ALL policy) for consistency with
-- operators/zones/sessions, and so a future requirement that diverges
-- insert/update/delete rules is a one-line edit, not a policy split.
create policy "rewards_insert_own_zone" on public.rewards
  for insert with check (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

create policy "rewards_update_own_zone" on public.rewards
  for update using (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

create policy "rewards_delete_own_zone" on public.rewards
  for delete using (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

revoke truncate on public.rewards from anon, authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — 4/4 assertions ok for `007_rewards_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_rewards.sql supabase/tests/database/007_rewards_rls.sql
git commit -m "feat(db): add rewards table — public read, owner-zone-scoped writes"
```

---

## Task 10: `wallet_ledger` table + RLS (SR-7, SR-8 — pre-empts reward farming per risk R6)

**Files:**
- Create: `supabase/migrations/0009_wallet_ledger.sql`
- Create: `supabase/tests/database/008_wallet_ledger_rls.sql`

- [ ] **Step 1: Write the failing RLS test**

```sql
-- supabase/tests/database/008_wallet_ledger_rls.sql
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.wallet_ledger" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0009_wallet_ledger.sql
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- a zero delta is never a legitimate ledger entry (credit/debit amount is
  -- business logic Phase 6 owns, but "did nothing" is universally invalid)
  delta int not null check (delta <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger enable row level security;

grant select on public.wallet_ledger to authenticated;

create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select using (user_id = auth.uid());

revoke truncate on public.wallet_ledger from anon, authenticated;

-- deliberately no insert/update/delete policy: only service_role may write,
-- enforced server-side by the Phase 6 reward-disbursement/redemption logic
```

- [ ] **Step 4: Apply and re-run**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: PASS — all test files green (`001`...`008`), full suite reported as ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_wallet_ledger.sql supabase/tests/database/008_wallet_ledger_rls.sql
git commit -m "feat(db): add wallet_ledger table — read-own, server-only writes"
```

---

## Task 11: Demo seed (one operator + one zone)

**Files:**
- Modify: `supabase/seed/seed.sql`

- [ ] **Step 1: Replace the Phase 0 placeholder with real seed data**

```sql
-- supabase/seed/seed.sql
-- Demo operator + demo zone for downstream phases (Phase 2 dashboard, Phase 3 mobile map).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo-operator@hush.local', '',
  now(), '{}'::jsonb, '{}'::jsonb,
  false, now(), now(), false, false
)
on conflict (id) do nothing;

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
  '{"committed_minutes": 45}'::jsonb,
  '{"reward_name": "Free coffee", "zone_hours_required": 5}'::jsonb
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
```

Note: `update public.users set role = 'operator' ...` runs as the seed script's own Postgres role (the CLI applies seeds as the `postgres` superuser, which bypasses RLS and is exempt from the `users_prevent_role_escalation` trigger's `auth.role()` check since there is no `request.jwt.claims` set — `auth.role()` returns null, and the trigger only blocks when a row's `role` is *changing* under a non-`service_role` JWT; a superuser session with no JWT claims at all does not go through PostgREST's RLS path. If this seed step errors with the escalation-guard exception when running via `supabase db reset`, change the trigger's condition in `0002_roles_and_users.sql` to also allow `auth.role() is null` (direct Postgres/superuser sessions), since RLS already restricts non-superuser authenticated/anon access to this table.

- [ ] **Step 2: Apply and verify the seed**

Run:
```bash
npx supabase db reset
```
Expected: migrations + seed apply with no errors (no `relation does not exist` / constraint violations printed).

- [ ] **Step 3: Verify the demo zone is queryable**

Run:
```bash
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)" -c "select name, operator_id from public.zones where id = '00000000-0000-0000-0000-00000000000a';"
```
Expected: one row, `name = 'Demo Cafe'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/seed.sql
git commit -m "feat(db): seed one demo operator and one demo zone"
```

---

## Task 12: `packages/shared-types` — author types from the schema (SR-4 groundwork)

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/user.ts`
- Create: `packages/shared-types/src/operator.ts`
- Create: `packages/shared-types/src/zone.ts`
- Create: `packages/shared-types/src/session.ts`
- Create: `packages/shared-types/src/score-ping.ts`
- Create: `packages/shared-types/src/quiet-index.ts`
- Create: `packages/shared-types/src/reward.ts`
- Create: `packages/shared-types/src/wallet-ledger.ts`

- [ ] **Step 1: Write `user.ts`**

```typescript
// packages/shared-types/src/user.ts
export type UserRole = "user" | "operator" | "admin";

export interface User {
  id: string;
  anonHandle: string;
  role: UserRole;
  prefs: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] **Step 2: Write `operator.ts`**

```typescript
// packages/shared-types/src/operator.ts
export interface Operator {
  id: string;
  venueName: string;
  badgeToken: string | null;
  createdAt: string;
}
```

- [ ] **Step 3: Write `zone.ts`**

```typescript
// packages/shared-types/src/zone.ts
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface SilenceContract {
  committed_minutes: number;
}

export interface RewardConfig {
  reward_name: string;
  zone_hours_required: number;
}

export interface Zone {
  id: string;
  operatorId: string;
  name: string;
  geofence: GeoJsonPolygon;
  silenceContract: SilenceContract;
  rewardConfig: RewardConfig;
  createdAt: string;
}
```

- [ ] **Step 4: Write `session.ts`**

```typescript
// packages/shared-types/src/session.ts
export interface Session {
  id: string;
  userId: string;
  zoneId: string;
  startTs: string;
  endTs: string | null;
  committedMinutes: number;
  achievedMinutes: number | null;
  finalScore: number | null;
  createdAt: string;
}
```

- [ ] **Step 5: Write `score-ping.ts`**

```typescript
// packages/shared-types/src/score-ping.ts
// Mirrors the score-ingest endpoint's accepted payload exactly (SR-9 minimal ingest):
// only these four fields are ever sent from a device — no app names, content, or keystrokes.
export interface ScorePing {
  anonSessionToken: string;
  zoneId: string;
  score: number;
  ts: string;
}
```

- [ ] **Step 6: Write `quiet-index.ts`**

```typescript
// packages/shared-types/src/quiet-index.ts
export interface QuietIndex {
  id: string;
  zoneId: string;
  ts: string;
  value: number;
  activeCount: number;
}
```

- [ ] **Step 7: Write `reward.ts`**

```typescript
// packages/shared-types/src/reward.ts
export interface Reward {
  id: string;
  zoneId: string;
  name: string;
  pointsCost: number;
  createdAt: string;
}
```

- [ ] **Step 8: Write `wallet-ledger.ts`**

```typescript
// packages/shared-types/src/wallet-ledger.ts
export interface WalletLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: string;
}
```

- [ ] **Step 9: Re-export everything from `index.ts`**

```typescript
// packages/shared-types/src/index.ts
export * from "./user";
export * from "./operator";
export * from "./zone";
export * from "./session";
export * from "./score-ping";
export * from "./quiet-index";
export * from "./reward";
export * from "./wallet-ledger";
```

- [ ] **Step 10: Typecheck the package**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npm run typecheck --workspace packages/shared-types
```
Expected: no errors.

- [ ] **Step 11: Typecheck the whole repo to confirm nothing else broke**

Run:
```bash
npm run typecheck
```
Expected: no errors (dashboard/mobile don't import these types yet, so this should be a no-op pass-through).

- [ ] **Step 12: Commit**

```bash
git add packages/shared-types/src
git commit -m "feat(shared-types): author Zone/Session/ScorePing/QuietIndex/Reward/WalletLedger/User/Operator types from the Phase 1 schema"
```

---

## Task 13: Local Supabase Auth config + `.env` wiring (SR-2, SR-5)

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.example`

- [ ] **Step 1: Extend `config.toml` with explicit local auth settings**

```toml
project_id = "hush-local"

[db]
major_version = 15

[api]
enabled = true

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = []
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false
```

Disabling email confirmations is a **local-dev-only** convenience (no mail server needed for the demo flow); it must not ship to a production Supabase project.

- [ ] **Step 2: Confirm the config is valid and the stack still starts with it**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase stop
npx supabase start
npx supabase status
```
Expected: stack starts clean, `status` shows the API/DB/Studio URLs and `Auth` reachable.

- [ ] **Step 3: Append the local stack's connection values to `.env.example` as documented placeholders**

Read the current file first (it already has `SUPABASE_URL` / `SUPABASE_ANON_KEY` / etc. keys from Phase 0 — do not duplicate them). Confirm each of these already-present keys has a one-line comment saying where its real local value comes from:

```
# Local values come from: npx supabase status -o env (SR-2: only ANON_KEY is safe to expose to clients; never put SERVICE_ROLE_KEY in mobile/dashboard env)
```
Add this single comment line directly above the existing `SUPABASE_URL=` line in `.env.example` if it isn't already there.

- [ ] **Step 4: Manually create your own local `.env` (git-ignored, not committed) using the real values**

Run:
```bash
npx supabase status -o env
```
Copy `API_URL` → `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_URL`, `ANON_KEY` → `SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` into a local `.env` file at the repo root. Do not commit this file (it's already git-ignored).

- [ ] **Step 5: Commit the config/template changes only**

```bash
git add supabase/config.toml .env.example
git commit -m "feat(auth): configure local Supabase Auth and document env wiring"
```

---

## Task 14: Full-suite verification and dependency audit (exit criteria)

**Files:** none (verification only)

- [ ] **Step 1: Reset the DB from scratch and run every migration + seed + test in one pass**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase db reset
npx supabase test db
```
Expected: all 8 RLS test files report `ok` for every assertion; no failures.

- [ ] **Step 2: Confirm the demo zone survived the reset**

Run:
```bash
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)" -c "select count(*) from public.zones;"
```
Expected: `count = 1`.

- [ ] **Step 3: Re-run the repo-wide typecheck and JS audit**

Run:
```bash
npm run typecheck
npm run audit:js
```
Expected: typecheck clean; `audit:js` shows the same baseline as Phase 0 (6 high / 23 moderate, all transitive Expo build-time deps — no new highs introduced by this phase's changes, since this phase touched only SQL + shared-types).

- [ ] **Step 4: Grep for any raw string-interpolated SQL (SR-6 self-check)**

Run:
```bash
grep -rn "EXECUTE format\|+ \$" supabase/migrations/ supabase/tests/ 2>&1 || true
```
Expected: no output (no dynamic SQL string-building of user input anywhere in this phase's SQL).

- [ ] **Step 5: Final commit marking Phase 1 complete**

```bash
git status
```
Expected: working tree clean (everything already committed task-by-task in Tasks 1–13). If anything is unstaged, stage and commit it now with a message describing what it is — do not bundle unrelated changes into one commit.
