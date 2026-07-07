# Phase 3 — Mobile Core: Map, Zone Discovery & Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can open the Hush mobile app, see the seeded "Demo Cafe" zone glowing on a map, check in (geofence-detected or manually confirmed) with an optional quiet-minutes intention, and check out — with every write enforced server-side (RLS + Postgres functions), never trusting the client.

**Architecture:** Mobile (Expo/React Native) talks **directly to Supabase** (PostgREST + RPC) the same way the dashboard does — there is no separate backend service for this phase. Because there is no Next.js API-route layer in front of Supabase for mobile, the two server-side guarantees the plan requires (SR-1 rate limiting, SR-6 parameterized point-in-polygon) are implemented as **Postgres functions/triggers**, not app code — they apply no matter what client calls them. Screens are switched with local React state (no navigation library) to keep native dependencies minimal. Maps use `react-native-maps` (already an Expo-supported library, avoids adding a second native map SDK alongside the dashboard's Mapbox).

**Tech Stack:** Expo + React Native + TypeScript, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-location`, `react-native-maps`, `zod`, `vitest` (pure-function unit tests), PostgreSQL/PostGIS (pgTAP for DB tests).

---

## Context for the engineer

- The repo is an npm-workspaces monorepo. `apps/mobile` already boots (Expo blank screen, see `apps/mobile/App.tsx`). `apps/dashboard` is a fully-built Next.js operator console you can copy patterns from (`apps/dashboard/lib/`).
- `packages/shared-types/src/{zone,session}.ts` already define `Zone` and `Session` camelCase interfaces mirroring the DB. Import them from mobile via the `@hush/shared-types` workspace package (see how `apps/dashboard/package.json` depends on it: `"@hush/shared-types": "*"`).
- DB schema relevant to this phase already exists:
  - `public.zones` (`supabase/migrations/0004_zones.sql`): `geography(Polygon,4326)` column `geofence`, RLS lets **any authenticated user read all zones** (`zones_select_all_authenticated`) — that's intentional, it's how zone discovery (U1) works.
  - `public.zones_geofence_geojson(z public.zones)` (`supabase/migrations/0012_zones_geofence_geojson.sql`) is a PostgREST computed column that returns the geofence as GeoJSON instead of raw WKB — select it as `geofence:zones_geofence_geojson` exactly like the dashboard does (`apps/dashboard/lib/mappers.ts`).
  - `public.sessions` (`supabase/migrations/0005_sessions.sql`): RLS already restricts users to their own rows (`user_id = auth.uid()`) for select/insert/update. `intended_minutes` is optional, 1–480 if present.
- Local Supabase env vars for mobile are already documented in `.env.example` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Expo only bundles vars prefixed `EXPO_PUBLIC_*` into the client (the mobile equivalent of Next's `NEXT_PUBLIC_*`), so never read any other env var name from app code.
- The demo zone seed (`supabase/seed/seed.sql`) creates zone id `00000000-0000-0000-0000-00000000000a`, a small polygon roughly `121.05–121.06 lng, 14.55–14.56 lat`. Use these coordinates for manual smoke-testing the geofence RPC.
- pgTAP test conventions: see `supabase/tests/database/004_sessions_rls.sql` for the existing sessions IDOR tests and `supabase/tests/database/000_helpers.sql` for `tests.create_test_user` / `tests.authenticate_as`. Run all DB tests with:
  `npx supabase test db`
  (run from repo root; requires local Supabase running — `npx supabase start`).
- Mobile has no test runner yet. The dashboard uses `vitest` (`apps/dashboard/vitest.config.ts`, `"test": "vitest run"` script) for plain TS unit tests without needing a DOM — mirror that exact setup for mobile's pure functions (no React Native rendering needed for this phase's test coverage).
- Anonymous sign-in is **not yet enabled** in `supabase/config.toml` (`[auth]` section has no `enable_anonymous_sign_ins`) — Task 8 turns it on, matching "Mobile auth (Supabase, anon ... for demo)" in the phase definition.

---

## Task 1: Sessions insert rate limit (SR-1)

**Files:**
- Create: `supabase/migrations/0013_sessions_rate_limit.sql`
- Create: `supabase/tests/database/009_sessions_rate_limit.sql`

There is no Next.js/FastAPI layer in front of mobile's writes to `sessions`, so the rate limit has to live in Postgres itself (a trigger), or it could be bypassed by any direct PostgREST call.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0013_sessions_rate_limit.sql
-- Mobile writes directly to Supabase (no API-route layer like the dashboard
-- has), so SR-1 rate limiting for check-ins has to be enforced in Postgres
-- itself -- a trigger applies no matter which client (app, curl, another
-- future client) calls insert.
create or replace function public.enforce_sessions_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.sessions
  where user_id = new.user_id
    and created_at > now() - interval '60 seconds';

  if recent_count >= 5 then
    raise exception 'rate limit exceeded: too many check-ins, try again shortly'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger sessions_rate_limit_trigger
before insert on public.sessions
for each row execute function public.enforce_sessions_rate_limit();
```

- [ ] **Step 2: Write the pgTAP test**

```sql
-- supabase/tests/database/009_sessions_rate_limit.sql
begin;
select plan(2);

select tests.create_test_user('77777777-7777-7777-7777-777777777777'::uuid);
insert into public.operators (id, venue_name) values ('77777777-7777-7777-7777-777777777777', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '77777777-7777-7777-7777-777777777777',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('77777777-7777-7777-7777-777777777777'::uuid);

-- 5 inserts in the same window succeed (at the limit, not over it).
select lives_ok(
  $$
    insert into public.sessions (user_id, zone_id)
    select '77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    from generate_series(1, 5)
  $$,
  'first 5 check-ins within the window succeed'
);

-- the 6th insert in the same 60s window is rejected.
select throws_ok(
  $$ insert into public.sessions (user_id, zone_id)
     values ('77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'P0001',
  'rate limit exceeded: too many check-ins, try again shortly',
  '6th check-in within 60s is rate-limited'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run**

Run: `npx supabase db reset` (applies all migrations + reseeds), then `npx supabase test db`
Expected: all tests pass, including the two new ones in `009_sessions_rate_limit.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_sessions_rate_limit.sql supabase/tests/database/009_sessions_rate_limit.sql
git commit -m "feat(db): rate-limit session check-ins server-side (SR-1)"
```

---

## Task 2: Point-in-polygon RPC for geofence detection (SR-6)

**Files:**
- Create: `supabase/migrations/0014_zone_contains_point.sql`
- Create: `supabase/tests/database/010_zone_contains_point.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0014_zone_contains_point.sql
-- Geofence check (U2): is a given lat/lng inside a zone's polygon? Always
-- parameterized (SR-6) -- never build geometry literals by string
-- concatenation. security invoker so the caller's own zones_select_all_
-- authenticated RLS grant (0004_zones.sql) governs which zone rows are
-- visible; this function adds no privilege beyond that.
create or replace function public.zone_contains_point(
  p_zone_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql
stable
security invoker
as $$
  select st_contains(
    z.geofence::geometry,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  )
  from public.zones z
  where z.id = p_zone_id;
$$;

grant execute on function public.zone_contains_point(uuid, double precision, double precision) to authenticated;
```

- [ ] **Step 2: Write the pgTAP test**

```sql
-- supabase/tests/database/010_zone_contains_point.sql
begin;
select plan(3);

select tests.create_test_user('66666666-6666-6666-6666-666666666666'::uuid);
insert into public.operators (id, venue_name) values ('66666666-6666-6666-6666-666666666666', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '66666666-6666-6666-6666-666666666666',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))')
);

set local role authenticated;
select tests.authenticate_as('66666666-6666-6666-6666-666666666666'::uuid);

select ok(
  (select public.zone_contains_point('dddddddd-dddd-dddd-dddd-dddddddddddd', 5, 5)),
  'a point well inside the polygon returns true (note: lat=5, lng=5)'
);

select ok(
  not (select public.zone_contains_point('dddddddd-dddd-dddd-dddd-dddddddddddd', 50, 50)),
  'a point well outside the polygon returns false'
);

select is(
  (select public.zone_contains_point('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 5, 5)),
  null,
  'an unknown zone id returns null (no row), not an error'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run**

Run: `npx supabase db reset && npx supabase test db`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_zone_contains_point.sql supabase/tests/database/010_zone_contains_point.sql
git commit -m "feat(db): add zone_contains_point RPC for geofence check-in (SR-6)"
```

---

## Task 3: Server-computed checkout RPC (SR-7)

**Files:**
- Create: `supabase/migrations/0015_checkout_session.sql`
- Create: `supabase/tests/database/011_checkout_session.sql`

`achieved_minutes` is a placeholder until Phase 4 introduces the real silence-scoring pipeline, but it must still be computed server-side from `start_ts`/`now()` — never accepted as a client-claimed value, consistent with how Phase 6 will treat all point-bearing numbers.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0015_checkout_session.sql
-- Closes a session. achieved_minutes is computed here from start_ts/now()
-- rather than accepted from the client -- even though it's only a display
-- placeholder until Phase 4's real scoring lands, the same "never trust a
-- client-claimed number" rule from PRD SR-8 applies. security invoker: the
-- explicit user_id = auth.uid() check is defense-in-depth on top of the
-- sessions_update_own RLS policy (0005_sessions.sql), matching the pattern
-- already used for zones/rewards (0008_rewards.sql, 0011_rls_update_with_check.sql).
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
      achieved_minutes = greatest(0, round(extract(epoch from (now() - start_ts)) / 60)::int)
  where id = p_session_id
    and user_id = auth.uid()
    and end_ts is null
  returning * into result;

  if result.id is null then
    raise exception 'session not found, not yours, or already checked out'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;

grant execute on function public.checkout_session(uuid) to authenticated;
```

- [ ] **Step 2: Write the pgTAP test**

```sql
-- supabase/tests/database/011_checkout_session.sql
begin;
select plan(4);

select tests.create_test_user('55555555-5555-5555-5555-555555555555'::uuid);
select tests.create_test_user('44444444-4444-4444-4444-444444444444'::uuid);
insert into public.operators (id, venue_name) values ('55555555-5555-5555-5555-555555555555', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '55555555-5555-5555-5555-555555555555',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);
insert into public.sessions (id, user_id, zone_id, start_ts) values (
  '12121212-1212-1212-1212-121212121212',
  '55555555-5555-5555-5555-555555555555',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  now() - interval '20 minutes'
);

set local role authenticated;
select tests.authenticate_as('44444444-4444-4444-4444-444444444444'::uuid);

select throws_ok(
  $$ select public.checkout_session('12121212-1212-1212-1212-121212121212') $$,
  'P0002',
  null,
  'user B cannot checkout user A''s session (IDOR guard)'
);

select tests.authenticate_as('55555555-5555-5555-5555-555555555555'::uuid);

select ok(
  (select achieved_minutes >= 19 and achieved_minutes <= 21
   from public.checkout_session('12121212-1212-1212-1212-121212121212')),
  'checkout computes achieved_minutes from elapsed start_ts (~20 min)'
);

select ok(
  (select end_ts is not null from public.sessions where id = '12121212-1212-1212-1212-121212121212'),
  'checkout sets end_ts'
);

select throws_ok(
  $$ select public.checkout_session('12121212-1212-1212-1212-121212121212') $$,
  'P0002',
  null,
  'a session already checked out cannot be checked out again'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and run**

Run: `npx supabase db reset && npx supabase test db`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_checkout_session.sql supabase/tests/database/011_checkout_session.sql
git commit -m "feat(db): add server-verified checkout_session RPC (SR-7)"
```

---

## Task 4: Enable anonymous sign-in for the mobile demo

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add the setting**

In `supabase/config.toml`, under the `[auth]` section (after `enable_signup = true` at line 18), add:

```toml
# Mobile demo auth (Phase 3): the app signs users in anonymously rather than
# requiring email signup, matching the PRD's "anon or email for demo" choice.
enable_anonymous_sign_ins = true
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset`
Expected: no errors; `npx supabase status -o env` still prints `ANON_KEY` etc.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(auth): enable anonymous sign-in for the mobile demo"
```

---

## Task 5: Mobile dependencies and test runner

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/vitest.config.ts`

- [ ] **Step 1: Update package.json**

```json
{
  "name": "@hush/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hush/shared-types": "*",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@supabase/supabase-js": "^2.108.0",
    "expo": "~52.0.0",
    "expo-location": "~18.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-maps": "1.18.0",
    "zod": "^4.4.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "^5.6.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Write vitest config**

```ts
// apps/mobile/vitest.config.ts
// Mirrors apps/dashboard/vitest.config.ts. This phase's pure functions
// (lib/glow.ts, lib/validation.ts, lib/mappers.ts) have no React Native
// imports, so a plain Node test environment is enough -- no jest-expo /
// RN renderer needed for this phase's coverage.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: installs cleanly at the workspace root, `apps/mobile/node_modules` is populated, no peer-dep errors fail the install.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/vitest.config.ts package-lock.json
git commit -m "feat(mobile): add Supabase, maps, location, and vitest dependencies"
```

---

## Task 6: Glow color scale (pure function, TDD)

**Files:**
- Create: `apps/mobile/lib/glow.ts`
- Create: `apps/mobile/lib/glow.test.ts`

This is the one place color carries meaning (Design Brief §3) — implement exactly the three-band temperature ramp.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/glow.test.ts
import { describe, expect, it } from "vitest";
import { quietIndexGlowColor } from "./glow";

describe("quietIndexGlowColor", () => {
  it("returns cool grey-blue for low quiet (0-30)", () => {
    expect(quietIndexGlowColor(0)).toBe("#8A98A6");
    expect(quietIndexGlowColor(30)).toBe("#8A98A6");
  });

  it("returns warm amber for medium quiet (31-70)", () => {
    expect(quietIndexGlowColor(31)).toBe("#D9A85E");
    expect(quietIndexGlowColor(70)).toBe("#D9A85E");
  });

  it("returns full warm glow for high quiet (71-100)", () => {
    expect(quietIndexGlowColor(71)).toBe("#E8C170");
    expect(quietIndexGlowColor(100)).toBe("#E8C170");
  });

  it("clamps out-of-range values instead of throwing", () => {
    expect(quietIndexGlowColor(-5)).toBe("#8A98A6");
    expect(quietIndexGlowColor(150)).toBe("#E8C170");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace apps/mobile`
Expected: FAIL with "Cannot find module './glow'" or similar.

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/lib/glow.ts
// Quiet Index "glow" scale (Design Brief §3) -- the one place color carries
// meaning in the whole app. Three discrete bands, not a gradient: 0-30 cool
// grey-blue (noisy), 31-70 warm amber (medium), 71-100 full warm glow (quiet).
export function quietIndexGlowColor(quietIndex: number): string {
  const clamped = Math.max(0, Math.min(100, quietIndex));
  if (clamped <= 30) return "#8A98A6";
  if (clamped <= 70) return "#D9A85E";
  return "#E8C170";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace apps/mobile`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/glow.ts apps/mobile/lib/glow.test.ts
git commit -m "feat(mobile): add Quiet Index glow color scale"
```

---

## Task 7: Intention/check-in validation (pure function, TDD)

**Files:**
- Create: `apps/mobile/lib/validation.ts`
- Create: `apps/mobile/lib/validation.test.ts`

Defense-in-depth client-side validation mirroring the DB constraint (`intended_minutes > 0 and <= 480`, `supabase/migrations/0005_sessions.sql:9`) — the DB is still the real enforcement, this just gives a friendly UI error before the round-trip.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/validation.test.ts
import { describe, expect, it } from "vitest";
import { validateIntendedMinutes } from "./validation";

describe("validateIntendedMinutes", () => {
  it("accepts null (no intention set)", () => {
    expect(validateIntendedMinutes(null)).toEqual({ ok: true });
  });

  it("accepts values within 1-480", () => {
    expect(validateIntendedMinutes(1)).toEqual({ ok: true });
    expect(validateIntendedMinutes(45)).toEqual({ ok: true });
    expect(validateIntendedMinutes(480)).toEqual({ ok: true });
  });

  it("rejects 0 or negative values", () => {
    expect(validateIntendedMinutes(0)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
    expect(validateIntendedMinutes(-10)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });

  it("rejects values over 480", () => {
    expect(validateIntendedMinutes(481)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });

  it("rejects non-finite values", () => {
    expect(validateIntendedMinutes(NaN)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace apps/mobile`
Expected: FAIL with "Cannot find module './validation'".

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/lib/validation.ts
export type ValidationResult = { ok: true } | { ok: false; reason: string };

// Mirrors the DB check constraint on sessions.intended_minutes
// (supabase/migrations/0005_sessions.sql) -- a quiet intention is optional
// (null), but if set must be a whole number of minutes in (0, 480].
export function validateIntendedMinutes(minutes: number | null): ValidationResult {
  if (minutes === null) return { ok: true };
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480) {
    return { ok: false, reason: "Quiet time must be between 1 and 480 minutes." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace apps/mobile`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/validation.ts apps/mobile/lib/validation.test.ts
git commit -m "feat(mobile): add intended-minutes validation"
```

---

## Task 8: Zone/session row mappers (pure function, TDD)

**Files:**
- Create: `apps/mobile/lib/mappers.ts`
- Create: `apps/mobile/lib/mappers.test.ts`

Mirrors `apps/dashboard/lib/mappers.ts` so mobile reads the same `geofence:zones_geofence_geojson` shape and converts snake_case DB rows to the camelCase `@hush/shared-types` shape.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/mappers.test.ts
import { describe, expect, it } from "vitest";
import { toZone, toSession, ZONE_SELECT } from "./mappers";

describe("ZONE_SELECT", () => {
  it("selects the geofence via the GeoJSON computed column", () => {
    expect(ZONE_SELECT).toContain("geofence:zones_geofence_geojson");
  });
});

describe("toZone", () => {
  it("maps a snake_case zone row to the camelCase Zone shape", () => {
    const row = {
      id: "z1",
      operator_id: "op1",
      name: "Demo Cafe",
      geofence: { type: "Polygon" as const, coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      silence_contract: { suggested_minutes: 45 },
      reward_config: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(toZone(row)).toEqual({
      id: "z1",
      operatorId: "op1",
      name: "Demo Cafe",
      geofence: row.geofence,
      silenceContract: { suggested_minutes: 45 },
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toSession", () => {
  it("maps a snake_case session row to the camelCase Session shape", () => {
    const row = {
      id: "s1",
      user_id: "u1",
      zone_id: "z1",
      start_ts: "2026-01-01T00:00:00Z",
      end_ts: null,
      intended_minutes: 20,
      achieved_minutes: null,
      final_score: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(toSession(row)).toEqual({
      id: "s1",
      userId: "u1",
      zoneId: "z1",
      startTs: "2026-01-01T00:00:00Z",
      endTs: null,
      intendedMinutes: 20,
      achievedMinutes: null,
      finalScore: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace apps/mobile`
Expected: FAIL with "Cannot find module './mappers'".

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/lib/mappers.ts
// Mirrors apps/dashboard/lib/mappers.ts -- Supabase JS returns raw snake_case
// DB columns; the app's components consistently use the camelCase
// @hush/shared-types shape. geofence:zones_geofence_geojson works around a
// `geography` column's default PostgREST serialization being raw WKB hex,
// not GeoJSON (supabase/migrations/0012_zones_geofence_geojson.sql).
import type { Session, Zone } from "@hush/shared-types";

export const ZONE_SELECT =
  "id, operator_id, name, geofence:zones_geofence_geojson, silence_contract, reward_config, created_at";

export function toZone(row: {
  id: string;
  operator_id: string;
  name: string;
  geofence: Zone["geofence"];
  silence_contract: Zone["silenceContract"];
  reward_config: Zone["rewardConfig"];
  created_at: string;
}): Zone {
  return {
    id: row.id,
    operatorId: row.operator_id,
    name: row.name,
    geofence: row.geofence,
    silenceContract: row.silence_contract,
    rewardConfig: row.reward_config,
    createdAt: row.created_at,
  };
}

export function toSession(row: {
  id: string;
  user_id: string;
  zone_id: string;
  start_ts: string;
  end_ts: string | null;
  intended_minutes: number | null;
  achieved_minutes: number | null;
  final_score: number | null;
  created_at: string;
}): Session {
  return {
    id: row.id,
    userId: row.user_id,
    zoneId: row.zone_id,
    startTs: row.start_ts,
    endTs: row.end_ts,
    intendedMinutes: row.intended_minutes,
    achievedMinutes: row.achieved_minutes,
    finalScore: row.final_score,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace apps/mobile`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/mappers.ts apps/mobile/lib/mappers.test.ts
git commit -m "feat(mobile): add zone/session row mappers"
```

---

## Task 9: Supabase client + anonymous auth bootstrap

**Files:**
- Create: `apps/mobile/lib/supabase.ts`
- Create: `apps/mobile/lib/auth.ts`

- [ ] **Step 1: Write the Supabase client**

```ts
// apps/mobile/lib/supabase.ts
// Mirrors apps/dashboard/lib/supabase/client.ts's anon-key-only pattern
// (SR-2: never the service-role key). AsyncStorage persists the session
// across app restarts; detectSessionInUrl is web-only and not applicable
// to a native client.
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

- [ ] **Step 2: Write the auth bootstrap**

```ts
// apps/mobile/lib/auth.ts
// The demo signs users in anonymously (supabase/config.toml's
// enable_anonymous_sign_ins, Task 4) rather than requiring email signup.
// Anonymous users still get a real auth.uid(), so every RLS policy
// (sessions_insert_own etc.) applies to them unchanged.
import { supabase } from "./supabase";

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signInData.session;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors (process.env access on `EXPO_PUBLIC_*` typechecks because Expo's babel preset injects these as string constants at build time — no `.d.ts` needed).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/supabase.ts apps/mobile/lib/auth.ts
git commit -m "feat(mobile): add Supabase client and anonymous auth bootstrap"
```

---

## Task 10: Zone fetching, geofence check, check-in, check-out services

**Files:**
- Create: `apps/mobile/lib/zones.ts`
- Create: `apps/mobile/lib/geofence.ts`
- Create: `apps/mobile/lib/checkin.ts`

- [ ] **Step 1: Write zone fetching**

```ts
// apps/mobile/lib/zones.ts
import type { Zone } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toZone, ZONE_SELECT } from "./mappers";

// Zone discovery (U1): zones_select_all_authenticated (0004_zones.sql) lets
// any authenticated user read every zone -- there is no operator scoping
// on the read side here, only on writes.
export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase.from("zones").select(ZONE_SELECT);
  if (error) throw error;
  return (data ?? []).map(toZone);
}
```

- [ ] **Step 2: Write the geofence check**

```ts
// apps/mobile/lib/geofence.ts
import { supabase } from "./supabase";

// U2: calls the server-side, parameterized point-in-polygon RPC
// (supabase/migrations/0014_zone_contains_point.sql, SR-6) -- never compute
// containment client-side as the source of truth, only the server's answer
// is trusted. Returns null when the check couldn't be determined (RPC error
// or unknown zone), which callers should treat as "offer manual confirm."
export async function checkInsideZone(zoneId: string, lat: number, lng: number): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("zone_contains_point", {
    p_zone_id: zoneId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) return null;
  return data;
}
```

- [ ] **Step 3: Write check-in/check-out**

```ts
// apps/mobile/lib/checkin.ts
import type { Session } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toSession } from "./mappers";
import { validateIntendedMinutes } from "./validation";

const SESSION_SELECT = "id, user_id, zone_id, start_ts, end_ts, intended_minutes, achieved_minutes, final_score, created_at";

// Creates a session row for the current user. RLS (sessions_insert_own,
// 0005_sessions.sql) is the real enforcement that a user can only check
// themselves in; this client-side validation is just a friendly early error.
export async function createCheckIn(zoneId: string, intendedMinutes: number | null): Promise<Session> {
  const validation = validateIntendedMinutes(intendedMinutes);
  if (!validation.ok) throw new Error(validation.reason);

  const { data, error } = await supabase
    .from("sessions")
    .insert({ zone_id: zoneId, intended_minutes: intendedMinutes })
    .select(SESSION_SELECT)
    .single();

  if (error) throw error;
  return toSession(data);
}

// Closes a session via the server-verified RPC (0015_checkout_session.sql)
// rather than an update -- achieved_minutes is computed server-side, never
// accepted from the client.
export async function checkOutSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase.rpc("checkout_session", { p_session_id: sessionId });
  if (error) throw error;
  return toSession(data);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/zones.ts apps/mobile/lib/geofence.ts apps/mobile/lib/checkin.ts
git commit -m "feat(mobile): add zone fetch, geofence check, and check-in/out services"
```

---

## Task 11: App config for maps and location permissions

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Add location permission config**

```json
{
  "expo": {
    "name": "Hush",
    "slug": "hush",
    "version": "0.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "android": {
      "package": "com.hush.app",
      "permissions": ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
    },
    "newArchEnabled": true,
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Hush uses your location to detect when you've entered a quiet zone."
        }
      ]
    ]
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx expo config --json --workspace-root apps/mobile 2>&1 | head -5` (or just open `apps/mobile/app.json` and confirm it's valid JSON)
Expected: valid JSON, `expo-location` plugin listed.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app.json
git commit -m "feat(mobile): configure location permissions for geofence check-in"
```

---

## Task 12: Map screen (U1 — live zone map with glow)

**Files:**
- Create: `apps/mobile/screens/MapScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/screens/MapScreen.tsx
// U1 hero screen: zones render as soft glowing blooms sized/colored by
// Quiet Index (Design Brief §5.2/§6). Quiet Index is a static placeholder
// (50) until Phase 5's realtime engine exists -- this screen only needs to
// prove the map + zone-discovery + tap-to-select loop for Phase 3.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";

const PLACEHOLDER_QUIET_INDEX = 50;

export function MapScreen({ onSelectZone }: { onSelectZone: (zone: Zone) => void }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E8C170" />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn't load zones: {errorMessage}</Text>
      </View>
    );
  }

  const firstRing = zones[0]?.geofence.coordinates[0] ?? [];
  const initialCenter = firstRing[0] ?? [0, 0];

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: initialCenter[1],
          longitude: initialCenter[0],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {zones.map((zone) => {
          const ring = zone.geofence.coordinates[0] ?? [];
          const center = ring.reduce(
            (acc, [lng, lat]) => [acc[0] + lng / ring.length, acc[1] + lat / ring.length],
            [0, 0]
          );
          return (
            <Marker
              key={zone.id}
              coordinate={{ latitude: center[1], longitude: center[0] }}
              onPress={() => onSelectZone(zone)}
            >
              <View
                style={[
                  styles.bloom,
                  { backgroundColor: quietIndexGlowColor(PLACEHOLDER_QUIET_INDEX) },
                ]}
              />
            </Marker>
          );
        })}
      </MapView>
      {zones.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>No quiet zones nearby yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0E1116" },
  errorText: { color: "#B07A5E", paddingHorizontal: 24, textAlign: "center" },
  bloom: { width: 28, height: 28, borderRadius: 14, opacity: 0.85 },
  emptyOverlay: { position: "absolute", bottom: 32, alignSelf: "center" },
  emptyText: { color: "#A9A296" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/MapScreen.tsx
git commit -m "feat(mobile): add live zone map screen (U1)"
```

---

## Task 13: Zone detail / check-in screen (U2)

**Files:**
- Create: `apps/mobile/screens/ZoneDetailScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/screens/ZoneDetailScreen.tsx
// Pre-check-in screen (Design Brief §5.3): zone name, an optional quiet-
// minutes intention, and a check-in action. Attempts a geofence read first
// (U2) but always offers a manual-confirm fallback for demo reliability --
// per the PRD, geofencing on real devices is unreliable enough that the
// check-in itself must never hard-block on it.
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session, Zone } from "@hush/shared-types";
import { checkInsideZone } from "../lib/geofence";
import { createCheckIn } from "../lib/checkin";
import { validateIntendedMinutes } from "../lib/validation";

type GeofenceStatus = "checking" | "inside" | "outside" | "unknown";

export function ZoneDetailScreen({
  zone,
  onCheckedIn,
}: {
  zone: Zone;
  onCheckedIn: (session: Session) => void;
}) {
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>("checking");
  const [minutesInput, setMinutesInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setGeofenceStatus("unknown");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const inside = await checkInsideZone(zone.id, position.coords.latitude, position.coords.longitude);
      if (cancelled) return;
      setGeofenceStatus(inside === null ? "unknown" : inside ? "inside" : "outside");
    })();
    return () => {
      cancelled = true;
    };
  }, [zone.id]);

  async function handleCheckIn() {
    const minutes = minutesInput.trim() === "" ? null : Number(minutesInput);
    const validation = validateIntendedMinutes(minutes);
    if (!validation.ok) {
      setValidationError(validation.reason);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = await createCheckIn(zone.id, minutes);
      onCheckedIn(session);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{zone.name}</Text>
      <Text style={styles.status}>
        {geofenceStatus === "checking" && "Checking your location…"}
        {geofenceStatus === "inside" && "You're inside this zone."}
        {geofenceStatus === "outside" && "You're outside this zone — you can still check in manually."}
        {geofenceStatus === "unknown" && "Couldn't confirm your location — you can still check in manually."}
      </Text>

      <Text style={styles.label}>Quiet minutes (optional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="e.g. 45"
        placeholderTextColor="#A9A296"
        value={minutesInput}
        onChangeText={setMinutesInput}
      />
      {validationError && <Text style={styles.errorText}>{validationError}</Text>}
      {submitError && <Text style={styles.errorText}>{submitError}</Text>}

      <Pressable style={styles.button} onPress={handleCheckIn} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#16140F" /> : <Text style={styles.buttonText}>Check in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116", padding: 24, justifyContent: "center" },
  title: { color: "#F4F6F8", fontSize: 28, fontWeight: "300", marginBottom: 8 },
  status: { color: "#A9A296", marginBottom: 24 },
  label: { color: "#A9A296", marginBottom: 8 },
  input: {
    color: "#F4F6F8",
    borderColor: "#4A463F",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: "#B07A5E", marginBottom: 8 },
  button: { backgroundColor: "#E8C170", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#16140F", fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/ZoneDetailScreen.tsx
git commit -m "feat(mobile): add zone detail/check-in screen (U2)"
```

---

## Task 14: Active session screen (check-out path)

**Files:**
- Create: `apps/mobile/screens/ActiveSessionScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/screens/ActiveSessionScreen.tsx
// The "in-zone" hero screen (Design Brief §5.5) is fully built in Phase 4
// (live silence score). For Phase 3 this is the minimal check-out path:
// show the intention, let the user end the session, surface the
// server-computed achieved_minutes placeholder.
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { checkOutSession } from "../lib/checkin";

export function ActiveSessionScreen({
  session,
  onCheckedOut,
}: {
  session: Session;
  onCheckedOut: (session: Session) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCheckOut() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await checkOutSession(session.id);
      onCheckedOut(updated);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Check-out failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quiet session in progress</Text>
      {session.intendedMinutes && (
        <Text style={styles.subtitle}>Intention: {session.intendedMinutes} quiet minutes</Text>
      )}
      <Text style={styles.hint}>Put your phone down. You can check out whenever you're ready.</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      <Pressable style={styles.button} onPress={handleCheckOut} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#16140F" /> : <Text style={styles.buttonText}>Check out</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116", padding: 24, justifyContent: "center", alignItems: "center" },
  title: { color: "#F4F6F8", fontSize: 24, fontWeight: "300", marginBottom: 12, textAlign: "center" },
  subtitle: { color: "#A9A296", marginBottom: 24 },
  hint: { color: "#A9A296", textAlign: "center", marginBottom: 32 },
  errorText: { color: "#B07A5E", marginBottom: 16 },
  button: { backgroundColor: "#E8C170", borderRadius: 8, paddingVertical: 16, paddingHorizontal: 32 },
  buttonText: { color: "#16140F", fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/ActiveSessionScreen.tsx
git commit -m "feat(mobile): add active session check-out screen"
```

---

## Task 15: Wire screens together in App.tsx

**Files:**
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Replace App.tsx**

```tsx
// apps/mobile/App.tsx
// No navigation library: Phase 3 only needs a 3-screen linear flow (map ->
// zone detail -> active session), and react-navigation pulls in
// react-native-screens/gesture-handler native deps this phase doesn't need.
// Revisit if a later phase needs deep linking or a tab bar.
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session, Zone } from "@hush/shared-types";
import { ensureSession } from "./lib/auth";
import { MapScreen } from "./screens/MapScreen";
import { ZoneDetailScreen } from "./screens/ZoneDetailScreen";
import { ActiveSessionScreen } from "./screens/ActiveSessionScreen";

type Screen =
  | { name: "map" }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session };

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "map" });

  useEffect(() => {
    ensureSession().finally(() => setAuthReady(true));
  }, []);

  if (!authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E8C170" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {screen.name === "map" && (
        <MapScreen onSelectZone={(zone) => setScreen({ name: "zoneDetail", zone })} />
      )}
      {screen.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={screen.zone}
          onCheckedIn={(session) => setScreen({ name: "activeSession", session })}
        />
      )}
      {screen.name === "activeSession" && (
        <ActiveSessionScreen
          session={screen.session}
          onCheckedOut={() => setScreen({ name: "map" })}
        />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116" },
  center: { flex: 1, backgroundColor: "#0E1116", alignItems: "center", justifyContent: "center" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat(mobile): wire map, zone detail, and active session screens"
```

---

## Task 16: Document mobile env setup

**Files:**
- Modify: `apps/mobile/package.json` (already done in Task 5 — this task is docs only)
- Create: `apps/mobile/.env.example`

Dashboard already needed its own `.env.local` because Next.js doesn't read the root `.env` (see commit `7184ca2`). Expo has the same constraint — document it the same way.

- [ ] **Step 1: Create the example file**

```
# apps/mobile/.env.example
# Expo only inlines EXPO_PUBLIC_* vars into the client bundle at build time,
# and (like Next.js) does not read the repo root .env -- copy these into
# apps/mobile/.env.local with real values from `npx supabase status -o env`.
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/.env.example
git commit -m "docs(mobile): document required Expo env vars"
```

---

## Task 17: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run all DB tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: every test file passes, including the three new ones from Tasks 1–3.

- [ ] **Step 2: Run mobile unit tests**

Run: `npm run test --workspace apps/mobile`
Expected: all vitest suites pass (glow, validation, mappers).

- [ ] **Step 3: Run mobile typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: no errors.

- [ ] **Step 4: Manual smoke test of the geofence RPC against the real seed data**

Run (with local Supabase running): `npx supabase db reset` then, via `psql` or the Supabase Studio SQL editor:

```sql
select public.zone_contains_point(
  '00000000-0000-0000-0000-00000000000a', -- Demo Cafe seed zone
  14.555, 121.055 -- inside the seeded polygon
);
-- expect: true

select public.zone_contains_point(
  '00000000-0000-0000-0000-00000000000a',
  14.6, 121.1 -- outside
);
-- expect: false
```

Expected: matches the comments above. Record the result in the task notes; this is the closest thing to an on-device verification possible without an attached Android emulator/device, which this environment does not have — note that explicitly rather than claiming the UI was visually verified.

- [ ] **Step 5: Record what wasn't verified**

In the final commit message or PR description, state plainly: mobile screens were typechecked and exercised only at the pure-function/RPC level — no Android emulator or physical device was available in this environment to visually verify `MapScreen`/`ZoneDetailScreen`/`ActiveSessionScreen` rendering or the `expo-location`/`react-native-maps` native integration. Recommend the user run `npm run android --workspace apps/mobile` on their own machine before treating Phase 3 as demo-ready.

---

## Self-review notes

- **Spec coverage:** mobile auth (Task 9), map + glow placeholder (Task 12), geofence detection + manual-confirm fallback (Tasks 2, 10, 13), intention setter creating a `sessions` row with optional `intended_minutes` (Tasks 7, 10, 13), check-out path (Tasks 3, 10, 14), SR-1 (Task 1), SR-4 (Task 7 client-side + existing DB constraints), SR-6 (Task 2), SR-7 (Tasks 1, 3 — IDOR tests).
- **Known limitation carried forward, not silently dropped:** no Android emulator/device in this environment — Task 17 makes that explicit rather than claiming a UI verification that didn't happen.
- **Type consistency:** `Zone`/`Session` field names (`geofence.coordinates`, `intendedMinutes`, etc.) match `packages/shared-types/src/{zone,session}.ts` exactly across Tasks 8, 10, 12–14.
