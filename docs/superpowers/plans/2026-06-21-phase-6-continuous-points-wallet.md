# Phase 6 — Continuous Points, Wallet & Session Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verified signs of disconnection accumulate points server-side; the user sees a calm session summary after checkout and a wallet they can redeem zone rewards from.

**Architecture:** All point math happens in Postgres (deterministic SQL/plpgsql functions, pgTAP-tested) so the client never mints or claims a point amount (SR-8). `checkout_session` is extended to finalize `final_score` and call a new `accrue_session_points` function that reads `score_pings` history + the zone's `reward_config` and writes a `wallet_ledger` credit. A new `redeem_reward` RPC debits the ledger and logs an immutable `redemptions` row (SR-13 audit trail), rate-limited and balance-checked server-side (SR-1/SR-7). Mobile gets a `lib/wallet.ts` client, a `SessionSummaryScreen`, and a `WalletScreen`, wired into `App.tsx`'s existing screen-union navigation.

**Tech Stack:** Supabase Postgres (plpgsql/SQL functions, pgTAP via `supabase test db`), `@hush/shared-types`, React Native/Expo + Vitest.

---

## Pre-existing bug this phase must fix first

`apps/mobile/lib/checkin.ts`'s `createCheckIn()` inserts a session without `user_id`. `public.sessions.user_id` has no DB default and the `sessions_insert_own` RLS policy requires `user_id = auth.uid()` — a real device insert is rejected with `42501`. This was flagged as a known gap in Phase 5 (see memory `hush-sessions-user-id-gap`) and explicitly deferred to "whoever touches check-in next" — which is this phase, since point accrual depends on real sessions existing. Task 1 fixes it with a DB-side default plus a regression test (no existing RLS test caught it because those tests insert sessions directly as `postgres`, bypassing the real app's path).

## Scope note: "continuous geofence presence" anti-gaming check

The master implementation plan's Phase 6 bullet lists "continuous geofence presence + periodic tap-to-stay-checked-in" alongside earning caps as anti-gaming measures (risk R2/R6). This plan implements the earning cap (`daily_point_cap`) and a stale-signal guard (the 60s-capped gap in `compute_eligible_quiet_minutes`, so a dropped or infrequent ping stream can't be credited as if it were continuously quiet). It does **not** add a separate continuous geofence re-check or a tap-to-stay UI: Phase 3/4 only verify geofence membership once, at check-in (`zone_contains_point`, `0014_zone_contains_point.sql`), and no later phase feeds a location stream into `score_pings` to re-verify presence per-ping. Building that pipeline is a real scope addition beyond "continuous points, wallet & session summary," so it's left as a documented gap for a future phase (the same pattern this plan already follows for the iOS Focus-mode fallback) rather than silently skipped.

---

### Task 1: Fix `sessions.user_id` to default to `auth.uid()`

**Files:**
- Create: `supabase/migrations/0018_sessions_user_id_default.sql`
- Create: `supabase/tests/database/014_sessions_user_id_default.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/014_sessions_user_id_default.sql
begin;
select plan(2);

select tests.create_test_user('90909090-9090-9090-9090-909090909090'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('90909090-9090-9090-9090-909090909090', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  '91919191-9191-9191-9191-919191919191',
  '90909090-9090-9090-9090-909090909090',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('90909090-9090-9090-9090-909090909090'::uuid);

-- this is the exact insert shape apps/mobile/lib/checkin.ts uses: no user_id
select lives_ok(
  $$ insert into public.sessions (zone_id, intended_minutes)
     values ('91919191-9191-9191-9191-919191919191', 20) $$,
  'a real check-in insert with no explicit user_id succeeds (DB default fills it)'
);

select is(
  (select user_id from public.sessions where zone_id = '91919191-9191-9191-9191-919191919191'),
  '90909090-9090-9090-9090-909090909090'::uuid,
  'the DB default fills user_id with auth.uid(), not null/another user'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: `014_sessions_user_id_default.sql` FAILs — `lives_ok` reports the insert raised `42501` (RLS violation), since `user_id` is currently `null` going into the `sessions_insert_own` policy check.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0018_sessions_user_id_default.sql
-- apps/mobile/lib/checkin.ts inserts {zone_id, intended_minutes} only -- no
-- column default ever existed for user_id, so that real-device insert has
-- been silently rejected by RLS since Phase 3 (see memory:
-- hush-sessions-user-id-gap, discovered while writing Phase 5's demo script,
-- which had to work around it by setting user_id explicitly). Point accrual
-- in this phase depends on real check-ins actually working, so fix it here:
-- the row's own creator is always auth.uid() for an authenticated insert.
alter table public.sessions
  alter column user_id set default auth.uid();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — both assertions in `014_sessions_user_id_default.sql`, and all prior test files still green (existing tests insert `user_id` explicitly, so the new default doesn't change their behavior).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_sessions_user_id_default.sql supabase/tests/database/014_sessions_user_id_default.sql
git commit -m "fix(db): default sessions.user_id to auth.uid() so real check-ins pass RLS"
```

---

### Task 2: `compute_eligible_quiet_minutes` — pure accrual math, unit-tested

**Files:**
- Create: `supabase/migrations/0019_session_points_accrual.sql` (this task writes only the first function in it)
- Create: `supabase/tests/database/015_compute_eligible_quiet_minutes.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/015_compute_eligible_quiet_minutes.sql
begin;
select plan(3);

select tests.create_test_user('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
  '2026-01-01T00:00:00Z'
);

-- 5 pings, 4 gaps of 300s (5 min) each, scores 80/85/60/90/95. min_score=70.
-- gap1 (80->t+300, eligible) capped at 60s = 1 min
-- gap2 (85->t+600, eligible) capped at 60s = 1 min
-- gap3 (60->t+900, NOT eligible, score below threshold) = 0
-- gap4 (90->t+1200, eligible) capped at 60s = 1 min
-- last ping (95) has no next ping, contributes nothing
-- total = 3 minutes
insert into public.score_pings (session_id, ts, score) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:00:00Z', 80),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:05:00Z', 85),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:10:00Z', 60),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:15:00Z', 90),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '2026-01-01T00:20:00Z', 95);

select is(
  public.compute_eligible_quiet_minutes('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'::uuid, 70),
  3.0::numeric,
  'eligible minutes = sum of capped gaps following a score >= threshold (long gaps capped at 60s)'
);

select is(
  public.compute_eligible_quiet_minutes('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'::uuid, 100),
  0.0::numeric,
  'a threshold higher than every score yields zero eligible minutes'
);

select is(
  public.compute_eligible_quiet_minutes('00000000-0000-0000-0000-000000000000'::uuid, 0),
  0.0::numeric,
  'a session with no score_pings yields zero eligible minutes, not null/error'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.compute_eligible_quiet_minutes(uuid, integer) does not exist`.

- [ ] **Step 3: Write the function**

```sql
-- supabase/migrations/0019_session_points_accrual.sql
-- Pure, deterministic accrual math (PRD: "deterministic and unit-tested").
-- For each pair of consecutive score_pings (ordered by ts), if the EARLIER
-- ping's score clears the zone's min_score_for_earning threshold, the gap
-- between the two pings counts as eligible quiet time. A gap is capped at
-- 60 seconds (4x the mobile client's 15s ping interval, the same "generous
-- headroom without runaway crediting" reasoning as the score_pings rate
-- limit in 0016_score_ping_ingest.sql) so a dropped-ping gap or a paused
-- session can't be credited as if it were continuously quiet for that long.
-- The interval before the first ping and after the last ping is never
-- credited -- there's no signal yet / anymore to justify it.
create or replace function public.compute_eligible_quiet_minutes(p_session_id uuid, p_min_score int)
returns numeric
language sql
stable
as $$
  with pings as (
    select
      ts,
      score,
      lead(ts) over (order by ts) as next_ts
    from public.score_pings
    where session_id = p_session_id
  )
  select coalesce(sum(
    extract(epoch from (least(next_ts, ts + interval '60 seconds') - ts))
  ), 0) / 60.0
  from pings
  where next_ts is not null
    and score >= p_min_score;
$$;

-- Internal helper only -- exposing it directly to clients would let a user
-- probe arbitrary sessions' score patterns; it is only ever called from
-- accrue_session_points (security definer, below) which already enforces
-- who may trigger crediting for which session.
revoke all on function public.compute_eligible_quiet_minutes(uuid, int) from public, anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 3 assertions in `015_compute_eligible_quiet_minutes.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_session_points_accrual.sql supabase/tests/database/015_compute_eligible_quiet_minutes.sql
git commit -m "feat(db): add compute_eligible_quiet_minutes, the pure point-accrual unit"
```

---

### Task 3: `accrue_session_points` — server-verified wallet crediting

**Files:**
- Modify: `supabase/migrations/0019_session_points_accrual.sql` (append to the same migration, since it's still unreleased within this phase)
- Create: `supabase/tests/database/016_accrue_session_points.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/016_accrue_session_points.sql
begin;
select plan(6);

select tests.create_test_user('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence, reward_config) values (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
  '{"earn_rate_per_quiet_minute": 2, "min_score_for_earning": 70, "daily_point_cap": 5}'::jsonb
);

-- active (not yet checked out) session -- accrual must refuse to run early
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '2026-01-01T00:00:00Z'
);

select is(
  public.accrue_session_points('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3'::uuid),
  0,
  'accrual refuses to credit a session that has not been checked out yet (end_ts is null)'
);

select is(
  (select count(*)::int from public.wallet_ledger where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
  0,
  'no ledger row was written for the still-active session'
);

-- checked-out session, 5 pings 60s apart all scoring 80 (>= threshold 70):
-- 4 gaps x 60s (no capping at exactly 60s) = 4 eligible minutes
-- raw points = 4 * earn_rate(2) = 8, clamped to daily_point_cap(5) = 5
insert into public.sessions (id, user_id, zone_id, start_ts, end_ts) values (
  'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4',
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:04:00Z'
);
insert into public.score_pings (session_id, ts, score) values
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:00:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:01:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:02:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:03:00Z', 80),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '2026-01-01T00:04:00Z', 80);

select is(
  public.accrue_session_points('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'::uuid),
  5,
  'points are earn_rate x eligible minutes, clamped to the zone daily_point_cap'
);

select is(
  (select delta from public.wallet_ledger where metadata->>'session_id' = 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'),
  5,
  'the credited amount is written to wallet_ledger as a positive delta'
);

select is(
  public.accrue_session_points('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'::uuid),
  0,
  'calling accrual again on an already-credited session is a no-op (idempotent, no double-credit)'
);

select is(
  (select count(*)::int from public.wallet_ledger where metadata->>'session_id' = 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'),
  1,
  'exactly one ledger row exists for the session even after calling accrual twice'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.accrue_session_points(uuid) does not exist`.

- [ ] **Step 3: Append the function to the migration**

```sql
-- (append to supabase/migrations/0019_session_points_accrual.sql)

-- Server-verified crediting (SR-8: never trust a client-claimed point
-- amount). SECURITY DEFINER is required because authenticated has no
-- insert grant on wallet_ledger (0009_wallet_ledger.sql) -- only this
-- function, running as its owner, may write a credit. Guarded so it can
-- only ever credit a session that has actually ended, and only once: a
-- malicious caller invoking this directly on someone else's already-ended,
-- not-yet-credited session would just credit that session's rightful
-- owner early (harmless, and checkout_session would have triggered the
-- same credit anyway) -- there is no path to mint points for yourself from
-- another user's session.
create or replace function public.accrue_session_points(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_zone public.zones;
  v_earn_rate numeric;
  v_min_score int;
  v_daily_cap int;
  v_eligible_minutes numeric;
  v_points int;
  v_already_credited boolean;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null or v_session.end_ts is null then
    return 0;
  end if;

  select exists(
    select 1 from public.wallet_ledger
    where reason = 'quiet_minute_accrual'
      and metadata->>'session_id' = p_session_id::text
  ) into v_already_credited;
  if v_already_credited then
    return 0;
  end if;

  select * into v_zone from public.zones where id = v_session.zone_id;
  v_earn_rate := coalesce((v_zone.reward_config->>'earn_rate_per_quiet_minute')::numeric, 0);
  v_min_score := coalesce((v_zone.reward_config->>'min_score_for_earning')::int, 100);
  v_daily_cap := (v_zone.reward_config->>'daily_point_cap')::int;

  v_eligible_minutes := public.compute_eligible_quiet_minutes(p_session_id, v_min_score);
  v_points := floor(v_eligible_minutes * v_earn_rate)::int;

  if v_daily_cap is not null and v_points > v_daily_cap then
    v_points := v_daily_cap;
  end if;

  if v_points > 0 then
    insert into public.wallet_ledger (user_id, delta, reason, metadata)
    values (
      v_session.user_id,
      v_points,
      'quiet_minute_accrual',
      jsonb_build_object(
        'session_id', p_session_id,
        'zone_id', v_session.zone_id,
        'eligible_minutes', round(v_eligible_minutes::numeric, 2)
      )
    );
  end if;

  return v_points;
end;
$$;

revoke all on function public.accrue_session_points(uuid) from public;
-- Called both directly (this grant, used by pgTAP and by checkout_session
-- below, which runs as the invoking authenticated user) and will be the
-- sole write path into wallet_ledger credits.
grant execute on function public.accrue_session_points(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 6 assertions in `016_accrue_session_points.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_session_points_accrual.sql supabase/tests/database/016_accrue_session_points.sql
git commit -m "feat(db): add accrue_session_points, server-verified wallet crediting"
```

---

### Task 4: Wire accrual into `checkout_session` + set `final_score`

**Files:**
- Create: `supabase/migrations/0020_checkout_session_accrual.sql`
- Create: `supabase/tests/database/017_checkout_session_accrual.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/017_checkout_session_accrual.sql
begin;
select plan(3);

select tests.create_test_user('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence, reward_config) values (
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
  '{"earn_rate_per_quiet_minute": 1, "min_score_for_earning": 50, "daily_point_cap": 100}'::jsonb
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  '2026-01-01T00:00:00Z'
);
insert into public.score_pings (session_id, ts, score) values
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', '2026-01-01T00:00:00Z', 60),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', '2026-01-01T00:01:00Z', 80);

set local role authenticated;
select tests.authenticate_as('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid);

select ok(
  (select final_score = 70 from public.checkout_session('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')),
  'checkout_session sets final_score to the average of this session''s score_pings'
);

select is(
  (select delta from public.wallet_ledger where metadata->>'session_id' = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  1,
  'checking out triggers accrual: 1 eligible minute (60->80, both >= 50) x earn_rate 1 = 1 point'
);

select is(
  (select count(*)::int from public.wallet_ledger where metadata->>'session_id' = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  1,
  'exactly one ledger row was created by this single checkout'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `final_score` is `null` (current `checkout_session` never sets it) and no `wallet_ledger` row exists.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0020_checkout_session_accrual.sql
-- Re-defines checkout_session (0015_checkout_session.sql) to also finalize
-- final_score (simple average of this session's score_pings -- null if the
-- device never sent one, e.g. it was checked out instantly) and trigger
-- server-verified point accrual. Stays SECURITY INVOKER like the original:
-- the UPDATE's security still rests on the explicit user_id = auth.uid()
-- check plus sessions_update_own RLS; accrue_session_points (SECURITY
-- DEFINER, granted to authenticated in 0019) is the only part of this
-- function that needs elevated privilege, and it enforces its own guards.
create or replace function public.checkout_session(p_session_id uuid)
returns public.sessions
language plpgsql
security invoker
as $$
declare
  result public.sessions;
begin
  update public.sessions
  set end_ts = now(),
      achieved_minutes = greatest(0, round(extract(epoch from (now() - start_ts)) / 60)::int),
      final_score = (select round(avg(score)) from public.score_pings where session_id = p_session_id)
  where id = p_session_id
    and user_id = auth.uid()
    and end_ts is null
  returning * into result;

  if result.id is null then
    raise exception 'session not found, not yours, or already checked out'
      using errcode = 'P0002';
  end if;

  perform public.accrue_session_points(p_session_id);

  return result;
end;
$$;

grant execute on function public.checkout_session(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 3 new assertions, plus `011_checkout_session.sql`'s existing 4 assertions still green (achieved_minutes/end_ts/IDOR/double-checkout behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_checkout_session_accrual.sql supabase/tests/database/017_checkout_session_accrual.sql
git commit -m "feat(db): checkout_session finalizes final_score and triggers point accrual"
```

---

### Task 5: `redemptions` table + RLS

**Files:**
- Create: `supabase/migrations/0021_redemptions.sql`
- Create: `supabase/tests/database/018_redemptions_rls.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/018_redemptions_rls.sql
begin;
select plan(3);

select tests.create_test_user('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid);
select tests.create_test_user('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'::uuid);

reset role;
insert into public.operators (id, venue_name) values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.rewards (id, zone_id, name, points_cost) values (
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  'Free coffee',
  50
);
insert into public.redemptions (user_id, reward_id, zone_id, points_spent) values (
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
  50
);

set local role authenticated;
select tests.authenticate_as('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'::uuid);

select is(
  (select count(*)::int from public.redemptions where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'),
  0,
  'user B cannot read user A''s redemptions (IDOR guard)'
);

select throws_ok(
  $$ insert into public.redemptions (user_id, reward_id, zone_id, points_spent)
     values ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 1) $$,
  '42501',
  null,
  'no client (not even the redeeming user) can insert a redemption directly -- server-verified only (SR-8/SR-13)'
);

select tests.authenticate_as('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid);

select is(
  (select points_spent from public.redemptions where reward_id = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'),
  50,
  'the owning user can read their own redemption row'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.redemptions" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0021_redemptions.sql
-- Immutable audit log of reward redemptions (SR-13: audit-log reward
-- disbursement & redemption). Same write-only-via-server-function stance
-- as wallet_ledger (0009_wallet_ledger.sql) -- this table and the matching
-- negative wallet_ledger entry are both written atomically by redeem_reward
-- (next task), never by a direct client insert.
create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  points_spent int not null check (points_spent > 0),
  created_at timestamptz not null default now()
);

alter table public.redemptions enable row level security;

grant select on public.redemptions to authenticated;

create policy "redemptions_select_own" on public.redemptions
  for select using (user_id = auth.uid());

-- deliberately no insert/update/delete grant or policy: only the
-- redeem_reward SECURITY DEFINER function (next migration) may write here.

revoke truncate on public.redemptions from anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 3 assertions in `018_redemptions_rls.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0021_redemptions.sql supabase/tests/database/018_redemptions_rls.sql
git commit -m "feat(db): add redemptions table as an immutable, owner-scoped audit log"
```

---

### Task 6: `redeem_reward` RPC

**Files:**
- Create: `supabase/migrations/0022_redeem_reward.sql`
- Create: `supabase/tests/database/019_redeem_reward.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/019_redeem_reward.sql
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.redeem_reward(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0022_redeem_reward.sql
-- Server-verified redemption (SR-1/SR-7/SR-8, risk R6: a client must never
-- be able to credit/debit its own wallet directly or farm redemptions).
-- SECURITY DEFINER because authenticated has no write grant on either
-- wallet_ledger or redemptions; both writes happen atomically in one
-- function call, never as two separate client round trips a user could
-- interrupt to get the debit without the audit row (or vice versa).
create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.rewards;
  v_balance int;
  v_recent_count int;
  v_redemption public.redemptions;
begin
  select * into v_reward from public.rewards where id = p_reward_id;
  if v_reward.id is null then
    raise exception 'reward not found' using errcode = 'P0002';
  end if;

  -- Redemptions are rare, deliberate user actions (unlike score pings);
  -- 3 within 60s is already more than any legitimate single-session use,
  -- so this is a tight anti-farming guard, not a real usage ceiling.
  select count(*) into v_recent_count
  from public.redemptions
  where user_id = auth.uid()
    and created_at > now() - interval '60 seconds';
  if v_recent_count >= 3 then
    raise exception 'rate limit exceeded: too many redemptions, try again shortly'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.wallet_ledger
  where user_id = auth.uid();

  if v_balance < v_reward.points_cost then
    raise exception 'insufficient balance' using errcode = 'P0001';
  end if;

  insert into public.wallet_ledger (user_id, delta, reason, metadata)
  values (
    auth.uid(),
    -v_reward.points_cost,
    'redemption',
    jsonb_build_object('reward_id', v_reward.id, 'reward_name', v_reward.name, 'zone_id', v_reward.zone_id)
  );

  insert into public.redemptions (user_id, reward_id, zone_id, points_spent)
  values (auth.uid(), v_reward.id, v_reward.zone_id, v_reward.points_cost)
  returning * into v_redemption;

  return v_redemption;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 6 assertions in `019_redeem_reward.sql`, and the full suite (`npx supabase test db`) green end to end.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0022_redeem_reward.sql supabase/tests/database/019_redeem_reward.sql
git commit -m "feat(db): add redeem_reward RPC -- balance-checked, rate-limited, audit-logged"
```

---

### Task 7: Shared `Redemption` type

**Files:**
- Create: `packages/shared-types/src/redemption.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: Write the type**

```typescript
// packages/shared-types/src/redemption.ts
// Mirrors public.redemptions (supabase/migrations/0021_redemptions.sql).
export interface Redemption {
  id: string;
  userId: string;
  rewardId: string;
  zoneId: string;
  pointsSpent: number;
  createdAt: string;
}
```

- [ ] **Step 2: Export it**

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
export * from "./redemption";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace packages/shared-types`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/redemption.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add Redemption type"
```

---

### Task 8: Mobile mappers for reward / wallet-ledger / redemption rows

**Files:**
- Modify: `apps/mobile/lib/mappers.ts`
- Modify: `apps/mobile/lib/mappers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/lib/mappers.test.ts` (read the existing file first to match its current `describe`/`it` structure and imports, then append):

```typescript
import { toReward, toWalletLedgerEntry, toRedemption } from "./mappers";

describe("toReward", () => {
  it("maps snake_case DB columns to the Reward shape", () => {
    expect(
      toReward({
        id: "r1",
        zone_id: "z1",
        name: "Free coffee",
        points_cost: 50,
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "r1",
      zoneId: "z1",
      name: "Free coffee",
      pointsCost: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toWalletLedgerEntry", () => {
  it("maps snake_case DB columns to the WalletLedgerEntry shape", () => {
    expect(
      toWalletLedgerEntry({
        id: "w1",
        user_id: "u1",
        delta: 5,
        reason: "quiet_minute_accrual",
        metadata: { session_id: "s1" },
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "w1",
      userId: "u1",
      delta: 5,
      reason: "quiet_minute_accrual",
      metadata: { session_id: "s1" },
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toRedemption", () => {
  it("maps snake_case DB columns to the Redemption shape", () => {
    expect(
      toRedemption({
        id: "rd1",
        user_id: "u1",
        reward_id: "r1",
        zone_id: "z1",
        points_spent: 50,
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "rd1",
      userId: "u1",
      rewardId: "r1",
      zoneId: "z1",
      pointsSpent: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace apps/mobile`
Expected: FAIL — `toReward`, `toWalletLedgerEntry`, `toRedemption` are not exported from `./mappers`.

- [ ] **Step 3: Add the mappers**

Append to `apps/mobile/lib/mappers.ts`:

```typescript
import type { Redemption, Reward, WalletLedgerEntry } from "@hush/shared-types";

export function toReward(row: {
  id: string;
  zone_id: string;
  name: string;
  points_cost: number;
  created_at: string;
}): Reward {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    pointsCost: row.points_cost,
    createdAt: row.created_at,
  };
}

export function toWalletLedgerEntry(row: {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}): WalletLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    delta: row.delta,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function toRedemption(row: {
  id: string;
  user_id: string;
  reward_id: string;
  zone_id: string;
  points_spent: number;
  created_at: string;
}): Redemption {
  return {
    id: row.id,
    userId: row.user_id,
    rewardId: row.reward_id,
    zoneId: row.zone_id,
    pointsSpent: row.points_spent,
    createdAt: row.created_at,
  };
}
```

Update the top import line in `apps/mobile/lib/mappers.ts` (currently `import type { Session, Zone } from "@hush/shared-types";`) to also bring in the new types — merge into one import:

```typescript
import type { Redemption, Reward, Session, WalletLedgerEntry, Zone } from "@hush/shared-types";
```

(Remove the second, now-redundant `import type { Redemption, Reward, WalletLedgerEntry } ...` line added above — keep a single import statement at the top of the file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace apps/mobile`
Expected: PASS — all mapper tests, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/mappers.ts apps/mobile/lib/mappers.test.ts
git commit -m "feat(mobile): add reward/wallet-ledger/redemption mappers"
```

---

### Task 9: `apps/mobile/lib/wallet.ts` client

**Files:**
- Create: `apps/mobile/lib/wallet.ts`
- Create: `apps/mobile/lib/wallet.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/lib/wallet.test.ts
import { describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function selectChain(data: unknown, error: unknown = null) {
  return { select: () => Promise.resolve({ data, error }) };
}

describe("getWalletBalance", () => {
  it("sums the delta of the caller's own ledger entries", async () => {
    fromMock.mockReturnValueOnce(selectChain([{ delta: 50 }, { delta: -20 }, { delta: 5 }]));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).resolves.toBe(35);
    expect(fromMock).toHaveBeenCalledWith("wallet_ledger");
  });

  it("returns 0 when the ledger is empty", async () => {
    fromMock.mockReturnValueOnce(selectChain([]));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).resolves.toBe(0);
  });

  it("throws when the read fails", async () => {
    fromMock.mockReturnValueOnce(selectChain(null, { message: "network error" }));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).rejects.toThrow("network error");
  });
});

describe("listRewards", () => {
  it("maps reward rows to the Reward shape", async () => {
    fromMock.mockReturnValueOnce(
      selectChain([{ id: "r1", zone_id: "z1", name: "Free coffee", points_cost: 50, created_at: "2026-01-01T00:00:00Z" }])
    );
    const { listRewards } = await import("./wallet");
    await expect(listRewards()).resolves.toEqual([
      { id: "r1", zoneId: "z1", name: "Free coffee", pointsCost: 50, createdAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("rewards");
  });
});

describe("redeemReward", () => {
  it("calls the redeem_reward RPC with the reward id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: "rd1", user_id: "u1", reward_id: "r1", zone_id: "z1", points_spent: 50, created_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const { redeemReward } = await import("./wallet");
    await expect(redeemReward("r1")).resolves.toEqual({
      id: "rd1",
      userId: "u1",
      rewardId: "r1",
      zoneId: "z1",
      pointsSpent: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(rpcMock).toHaveBeenCalledWith("redeem_reward", { p_reward_id: "r1" });
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "insufficient balance" } });
    const { redeemReward } = await import("./wallet");
    await expect(redeemReward("r1")).rejects.toThrow("insufficient balance");
  });
});

describe("getSessionPointsAwarded", () => {
  it("sums quiet_minute_accrual ledger entries tagged with this session", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [{ delta: 5 }], error: null }),
        }),
      }),
    });
    const { getSessionPointsAwarded } = await import("./wallet");
    await expect(getSessionPointsAwarded("s1")).resolves.toBe(5);
  });

  it("returns 0 when no accrual has landed yet for this session", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });
    const { getSessionPointsAwarded } = await import("./wallet");
    await expect(getSessionPointsAwarded("s1")).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace apps/mobile`
Expected: FAIL — `./wallet` module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/wallet.ts
import type { Redemption, Reward } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toRedemption, toReward } from "./mappers";

// RLS (wallet_ledger_select_own, 0009_wallet_ledger.sql) already scopes this
// read to the caller's own rows -- summing client-side avoids adding a
// dedicated balance RPC for a read the client can already safely make.
export async function getWalletBalance(): Promise<number> {
  const { data, error } = await supabase.from("wallet_ledger").select("delta");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total: number, row: { delta: number }) => total + row.delta, 0);
}

// Reward browsing is public for any signed-in user (rewards_select_all,
// 0008_rewards.sql) -- the wallet screen lists every zone's rewards.
export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards")
    .select("id, zone_id, name, points_cost, created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toReward);
}

// Server-verified: redeem_reward (0022_redeem_reward.sql) checks balance,
// rate limit, and writes both the wallet debit and the audit row atomically.
export async function redeemReward(rewardId: string): Promise<Redemption> {
  const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) throw new Error(error.message);
  return toRedemption(data);
}

// Reads the credit accrue_session_points (0019_session_points_accrual.sql)
// wrote for this specific session, so the summary screen shows the real
// server-decided award rather than a client guess.
export async function getSessionPointsAwarded(sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("delta")
    .eq("reason", "quiet_minute_accrual")
    .eq("metadata->>session_id", sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total: number, row: { delta: number }) => total + row.delta, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace apps/mobile`
Expected: PASS — all `wallet.test.ts` cases.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/wallet.ts apps/mobile/lib/wallet.test.ts
git commit -m "feat(mobile): add wallet client (balance, rewards, redeem, session payout)"
```

---

### Task 10: `SessionSummaryScreen`

**Files:**
- Create: `apps/mobile/screens/SessionSummaryScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
// apps/mobile/screens/SessionSummaryScreen.tsx
// U7: shown once after check-out. Calm celebration per Design Brief --
// no confetti, no urgency, just the numbers the server already finalized.
import { StyleSheet, Pressable, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { colors, fonts } from "../lib/theme";

export function SessionSummaryScreen({
  session,
  pointsAwarded,
  onViewWallet,
  onDone,
}: {
  session: Session;
  pointsAwarded: number;
  onViewWallet: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Session complete</Text>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.achievedMinutes ?? "--"}</Text>
          <Text style={styles.tileLabel}>QUIET MINUTES</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.finalScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>AVERAGE SILENCE</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, styles.tileValueAccent]}>{pointsAwarded}</Text>
          <Text style={styles.tileLabel}>POINTS AWARDED</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        {pointsAwarded > 0
          ? "Your wallet has been credited."
          : "No points this time -- stay quietly checked in longer to earn some."}
      </Text>
      <Pressable style={styles.primaryButton} onPress={onViewWallet}>
        <Text style={styles.primaryButtonText}>View wallet</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onDone}>
        <Text style={styles.secondaryButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night, padding: 24, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: colors.nightLabel, textTransform: "uppercase", marginBottom: 24 },
  tiles: { flexDirection: "row", gap: 10, marginBottom: 20, width: "100%", maxWidth: 320 },
  tile: { flex: 1, backgroundColor: colors.nightCard, borderRadius: 16, padding: 14, alignItems: "center" },
  tileValue: { fontFamily: fonts.hero, fontSize: 24, color: colors.nightWarmText },
  tileValueAccent: { color: colors.glowHigh },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 1, color: colors.nightMutedText, marginTop: 4, textAlign: "center" },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.nightHint, textAlign: "center", marginBottom: 28, maxWidth: 280 },
  primaryButton: { backgroundColor: colors.glowHigh, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, marginBottom: 12 },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, color: colors.night },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 24 },
  secondaryButtonText: { fontFamily: fonts.body, color: colors.nightHint },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: PASS, no errors (no unit test for this presentational screen, consistent with `ActiveSessionScreen.tsx`/`MapScreen.tsx`, which also have no `.test.tsx` files — logic lives in `lib/`, screens are typechecked only).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/SessionSummaryScreen.tsx
git commit -m "feat(mobile): add SessionSummaryScreen (U7)"
```

---

### Task 11: `WalletScreen`

**Files:**
- Create: `apps/mobile/screens/WalletScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
// apps/mobile/screens/WalletScreen.tsx
// U6: balance + reward list + redeem flow.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Reward } from "@hush/shared-types";
import { getWalletBalance, listRewards, redeemReward } from "../lib/wallet";
import { colors, fonts } from "../lib/theme";

export function WalletScreen({ onClose }: { onClose: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getWalletBalance(), listRewards()])
      .then(([balanceValue, rewardList]) => {
        setBalance(balanceValue);
        setRewards(rewardList);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRedeem(reward: Reward) {
    setRedeemingId(reward.id);
    setErrorMessage(null);
    setConfirmation(null);
    try {
      await redeemReward(reward.id);
      const freshBalance = await getWalletBalance();
      setBalance(freshBalance);
      setConfirmation(`Redeemed: ${reward.name}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Redemption failed.");
    } finally {
      setRedeemingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
      <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
      <Text style={styles.balanceValue}>{balance ?? 0}</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      {confirmation && <Text style={styles.confirmationText}>{confirmation}</Text>}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {rewards.map((reward) => {
          const affordable = (balance ?? 0) >= reward.pointsCost;
          return (
            <View key={reward.id} style={styles.rewardRow}>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardName}>{reward.name}</Text>
                <Text style={styles.rewardCost}>{reward.pointsCost} points</Text>
              </View>
              <Pressable
                style={[styles.redeemButton, !affordable && styles.redeemButtonDisabled]}
                disabled={!affordable || redeemingId === reward.id}
                onPress={() => handleRedeem(reward)}
              >
                <Text style={styles.redeemButtonText}>
                  {redeemingId === reward.id ? "Redeeming…" : "Redeem"}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {rewards.length === 0 && <Text style={styles.emptyText}>No rewards available yet.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night, padding: 24, paddingTop: 56 },
  center: { flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  closeButton: { position: "absolute", top: 20, right: 20 },
  closeButtonText: { fontFamily: fonts.body, color: colors.nightHint },
  balanceLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: colors.nightLabel, textAlign: "center" },
  balanceValue: { fontFamily: fonts.hero, fontSize: 48, color: colors.glowHigh, textAlign: "center", marginBottom: 24 },
  errorText: { fontFamily: fonts.body, color: colors.alert, textAlign: "center", marginBottom: 12 },
  confirmationText: { fontFamily: fonts.body, color: colors.nightWarmText, textAlign: "center", marginBottom: 12 },
  list: { flex: 1 },
  listContent: { gap: 10 },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.nightCard,
    borderRadius: 16,
    padding: 16,
  },
  rewardInfo: { flex: 1 },
  rewardName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.nightWarmText },
  rewardCost: { fontFamily: fonts.body, fontSize: 12, color: colors.nightMutedText, marginTop: 2 },
  redeemButton: { backgroundColor: colors.glowHigh, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  redeemButtonDisabled: { backgroundColor: colors.nightBorder },
  redeemButtonText: { fontFamily: fonts.bodySemiBold, color: colors.night, fontSize: 12 },
  emptyText: { fontFamily: fonts.body, color: colors.nightHint, textAlign: "center", marginTop: 40 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/WalletScreen.tsx
git commit -m "feat(mobile): add WalletScreen (U6)"
```

---

### Task 12: Wire summary + wallet into `App.tsx` and `MapScreen`

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/screens/MapScreen.tsx`

- [ ] **Step 1: Add a wallet entry point to `MapScreen`**

In `apps/mobile/screens/MapScreen.tsx`, change the function signature and add a header button:

```tsx
export function MapScreen({
  onSelectZone,
  onOpenWallet,
}: {
  onSelectZone: (zone: Zone) => void;
  onOpenWallet: () => void;
}) {
```

Add inside the returned `<View style={styles.container}>`, as the first child (before `<MapView>`):

```tsx
      <Pressable style={styles.walletButton} onPress={onOpenWallet}>
        <Text style={styles.walletButtonText}>Wallet</Text>
      </Pressable>
```

Add `Pressable` to the existing `react-native` import line, and add to `styles`:

```tsx
  walletButton: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 1,
    backgroundColor: "rgba(35,32,26,0.85)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  walletButtonText: { color: "#E8C170", fontWeight: "600", fontSize: 12 },
```

- [ ] **Step 2: Extend the screen union and wire navigation in `App.tsx`**

Replace the imports, `Screen` type, `handleSelectZone`/render block as follows.

Add imports:

```tsx
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { getSessionPointsAwarded } from "./lib/wallet";
```

Extend the `Screen` union:

```tsx
type Screen =
  | { name: "map" }
  | { name: "permissionOnboarding"; zone: Zone }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session }
  | { name: "sessionSummary"; session: Session; pointsAwarded: number }
  | { name: "wallet"; returnTo: Screen };
```

Add a checkout handler (replacing the inline `onCheckedOut={() => setScreen({ name: "map" })}` on `ActiveSessionScreen`):

```tsx
  async function handleCheckedOut(session: Session) {
    let pointsAwarded = 0;
    try {
      pointsAwarded = await getSessionPointsAwarded(session.id);
    } catch {
      // The session is already checked out either way -- a failed payout
      // read just shows 0 rather than blocking the summary screen.
    }
    setScreen({ name: "sessionSummary", session, pointsAwarded });
  }
```

Update the render block:

```tsx
  return (
    <View style={styles.container}>
      {screen.name === "map" && (
        <MapScreen onSelectZone={handleSelectZone} onOpenWallet={() => setScreen({ name: "wallet", returnTo: screen })} />
      )}
      {screen.name === "permissionOnboarding" && (
        <PermissionOnboardingScreen
          onContinue={() => setScreen({ name: "zoneDetail", zone: screen.zone })}
        />
      )}
      {screen.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={screen.zone}
          onCheckedIn={(session) => setScreen({ name: "activeSession", session })}
        />
      )}
      {screen.name === "activeSession" && (
        <ActiveSessionScreen session={screen.session} onCheckedOut={handleCheckedOut} />
      )}
      {screen.name === "sessionSummary" && (
        <SessionSummaryScreen
          session={screen.session}
          pointsAwarded={screen.pointsAwarded}
          onViewWallet={() => setScreen({ name: "wallet", returnTo: { name: "map" } })}
          onDone={() => setScreen({ name: "map" })}
        />
      )}
      {screen.name === "wallet" && (
        <WalletScreen onClose={() => setScreen(screen.returnTo)} />
      )}
      <StatusBar style="light" />
    </View>
  );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: PASS, no errors.

- [ ] **Step 4: Run the full mobile test suite**

Run: `npm test --workspace apps/mobile`
Expected: PASS, all existing + new tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/screens/MapScreen.tsx
git commit -m "feat(mobile): wire session summary and wallet screens into navigation"
```

---

### Task 13: End-to-end verification script against the local stack

**Files:**
- Create: `scripts/verify-wallet-flow.mjs`

This mirrors the style of `scripts/simulate-quiet-index.mjs` (Phase 5) — a direct `@supabase/supabase-js` script against the local stack, anon-key only, since the mobile UI itself can't be driven headlessly the way the dashboard's Playwright script drives a browser.

- [ ] **Step 1: Write the script**

```javascript
// scripts/verify-wallet-flow.mjs
// Phase 6 demo/verification: proves the full continuous-points loop against
// a real local stack, not just pgTAP fixtures -- check in, send rising score
// pings clearing the demo zone's min_score_for_earning (70), check out,
// confirm points landed in the wallet, then redeem the seeded "Free coffee"
// reward and confirm the balance drops accordingly.
//
// Run:
//   npx supabase db reset && npx supabase start
//   node scripts/verify-wallet-flow.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_ZONE_ID = "00000000-0000-0000-0000-00000000000a";
const DEMO_REWARD_ID = "00000000-0000-0000-0000-00000000000b";

const client = createClient(SUPABASE_URL, ANON_KEY);
const { data: signIn, error: signInError } = await client.auth.signInAnonymously();
if (signInError) throw signInError;
console.log(`Signed in anonymously as ${signIn.user.id}`);

// Relies on Task 1's auth.uid() default -- this insert omits user_id, the
// exact shape apps/mobile/lib/checkin.ts uses.
const { data: session, error: checkInError } = await client
  .from("sessions")
  .insert({ zone_id: DEMO_ZONE_ID, intended_minutes: 20 })
  .select("id, anon_token")
  .single();
if (checkInError) throw checkInError;
console.log(`Checked in: session ${session.id}`);

console.log("Sending 5 score pings >= 70, 60s apart (simulated via backdated ts)...");
const baseTs = Date.now() - 4 * 60_000;
for (let i = 0; i < 5; i++) {
  const { error } = await client.rpc("ingest_score_ping", {
    p_anon_token: session.anon_token,
    p_zone_id: DEMO_ZONE_ID,
    p_score: 80,
    p_ts: new Date(baseTs + i * 60_000).toISOString(),
  });
  if (error) throw error;
}
console.log("  5 pings sent.");

const { data: checkedOut, error: checkoutError } = await client.rpc("checkout_session", {
  p_session_id: session.id,
});
if (checkoutError) throw checkoutError;
console.log(`Checked out: final_score=${checkedOut.final_score} achieved_minutes=${checkedOut.achieved_minutes}`);

const { data: ledgerRows, error: ledgerError } = await client
  .from("wallet_ledger")
  .select("delta, reason")
  .eq("reason", "quiet_minute_accrual");
if (ledgerError) throw ledgerError;
const pointsAwarded = ledgerRows.reduce((sum, row) => sum + row.delta, 0);
console.log(`Points awarded from accrual: ${pointsAwarded}`);
if (pointsAwarded <= 0) {
  console.error("FAIL: expected a positive point credit from this quiet session.");
  process.exitCode = 1;
}

console.log(`Redeeming seeded reward ${DEMO_REWARD_ID}...`);
const { data: redemption, error: redeemError } = await client.rpc("redeem_reward", {
  p_reward_id: DEMO_REWARD_ID,
});

if (pointsAwarded >= 50) {
  if (redeemError) throw redeemError;
  console.log(`  Redeemed: points_spent=${redemption.points_spent}`);
  const { data: afterRows } = await client.from("wallet_ledger").select("delta");
  const balance = afterRows.reduce((sum, row) => sum + row.delta, 0);
  console.log(`Final balance: ${balance}`);
  console.log("\nPASS: check-in -> accrual -> checkout -> redemption all verified end to end.");
} else {
  console.log(`  Skipped redemption: balance ${pointsAwarded} is below the reward's cost (expected, not a failure).`);
  console.log("\nPASS: check-in -> accrual -> checkout verified end to end (redemption needs a longer session to afford).");
}
```

- [ ] **Step 2: Run it**

Run:
```bash
npx supabase db reset
npx supabase start
node scripts/verify-wallet-flow.mjs
```
Expected: `PASS` printed at the end; non-zero exit only if the accrual produced zero points.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-wallet-flow.mjs
git commit -m "test(scripts): add end-to-end wallet flow verification against local stack"
```

---

### Task 14: Final phase verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full DB reset + pgTAP suite**

Run: `npx supabase db reset && npx supabase test db`
Expected: every test file (000–019) passes, including all of this phase's new files (014–019).

- [ ] **Step 2: Typecheck everything**

Run: `npm run typecheck`
Expected: PASS across all workspaces (`packages/shared-types`, `apps/mobile`, `apps/dashboard`, `apps/ai-service` if it has a TS step — otherwise skip non-TS workspaces).

- [ ] **Step 3: Mobile test suite**

Run: `npm test --workspace apps/mobile`
Expected: PASS, all suites green.

- [ ] **Step 4: Run the end-to-end script one more time from a clean reset**

Run:
```bash
npx supabase db reset
node scripts/verify-wallet-flow.mjs
```
Expected: `PASS` (confirms the whole phase works against a freshly-seeded stack, not just a stack with leftover state from earlier manual testing).

- [ ] **Step 5: Security gate self-check (per CLAUDE.md, do not defer to Phase 10)**

Confirm and note in the final commit message or a short PR-style summary:
- **SR-1**: `redeem_reward` rate-limited (3/60s); ingest/session endpoints already limited from prior phases.
- **SR-7/SR-8**: `wallet_ledger` and `redemptions` have no client write grant; all credits/debits flow through `accrue_session_points`/`redeem_reward`, both server-verified, both with IDOR negative tests.
- **SR-13**: every credit and debit is an immutable `wallet_ledger` row with `metadata`; every redemption additionally gets a `redemptions` audit row.

- [ ] **Step 6: Commit the plan's completion marker**

No code changes needed if Steps 1–4 are clean. If any drift was found and fixed, commit it with a message describing the fix, e.g.:

```bash
git commit -m "fix(phase-6): address verification sweep findings"
```
