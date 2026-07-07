# Phase 4 — On-Device Silence Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a user is checked into a zone, the phone privately computes a 0–100 silence score from on-device signals (screen-off duration, DND state, foreground-app activity) and transmits **only** `{anon_session_token, zone_id, score, ts}` to the server, which resolves it to the caller's own active session and stores it as a candidate earning input for Phase 6 — never crediting points from the device itself.

**Architecture:** A new Postgres `anon_token` capability on `sessions` plus a `security definer` RPC (`ingest_score_ping`) are the server-side ingest boundary — the wire payload never carries `session_id` or `user_id`, only the opaque token, matching the `ScorePing` type already defined in `packages/shared-types`. On the device, an Expo local native module (Kotlin) exposes raw OS signals; a pure, fixture-tested scoring function turns them into a smoothed 0–100 score; a polling loop in `ActiveSessionScreen` reads signals, scores them, and posts pings on an interval. The permission-onboarding screen and the in-zone session screen are restyled to match the Phase 4 wireframes in `documents/design-specifications-summary/project/Hush Wireframes.dc.html` (flows A.01d and C.05) — comments in the existing `ActiveSessionScreen.tsx` already flag this restyle as Phase 4's job.

**Tech Stack:** Expo Modules API (Kotlin, local module, custom dev client already wired via `expo run:android`) · Supabase Postgres RPC (`security definer`) + pgTAP · Vitest (pure-function TDD) · React Native `Animated` for the breathing orb · `@expo-google-fonts/hanken-grotesk` + `@expo-google-fonts/newsreader` for the two type families in the Design Brief.

---

## Design reference (read before Tasks 9–11)

Palette (`documents/design-specifications-summary/project/Hush Wireframes.dc.html`):
- Ink `#22201D`, Charcoal `#4A463F`, Paper `#F5F1EA`, Surface `#FBF8F2`, Night `#16140F`
- Accent sage `#6B7F6E`
- Quiet Index glow ramp already implemented in `apps/mobile/lib/glow.ts` (`#8A98A6` / `#D9A85E` / `#E8C170`) — reuse, don't redefine
- Reward `#C9A24B`, Alert `#B07A5E`

Typography: `Newsreader` (weight 300) for hero numerals/headings, `Hanken Grotesk` (weights 400/600) for all UI text and small tracked uppercase labels.

Screen 01d "Permissions" (onboarding): paper background, plain-language permission rows (icon chip + title + description + toggle) in a `Surface` card with `1px #E4DDD1` border and `16px` radius, "Allow & continue" pill button in accent sage, small charcoal-on-paper helper line below.

Screen 05 "In-zone session" (hero, dark): Night background `#16140F`, small tracked uppercase zone label in `#8A7A54`, a large breathing radial-gradient orb (outer soft blur halo + inner solid core) showing the live score in `Newsreader` 300, two stat tiles below (`REMAINING` mm:ss, `YOUR SILENCE` score) on `#23201A` cards, and a calm one-line footer hint. Breathing animation runs on a ~4s loop and must respect `prefers-reduced-motion` (use `AccessibilityInfo.isReduceMotionEnabled()` on RN).

---

## Task 1: DB — anon session token, minimal-ingest RPC, rate limit

**Files:**
- Create: `supabase/migrations/0016_score_ping_ingest.sql`
- Create: `supabase/tests/database/012_score_ping_ingest.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0016_score_ping_ingest.sql

-- Capability token a checked-in device uses to post score pings without ever
-- knowing its own session_id (SR-9 minimal ingest: the wire payload is
-- {anon_session_token, zone_id, score, ts} only). Generated server-side at
-- check-in, unique, never updated.
alter table public.sessions
  add column anon_token uuid not null default gen_random_uuid();

alter table public.sessions
  add constraint sessions_anon_token_key unique (anon_token);

-- The ingest RPC is the only way to write score_pings from now on: revoke the
-- direct table grant from Phase 1 (0006_score_pings.sql) so a client can no
-- longer bypass the minimal-ingest contract by inserting {session_id, score}
-- directly. The RLS select policy is untouched -- a user can still read their
-- own score history.
revoke insert on public.score_pings from authenticated;

create or replace function public.ingest_score_ping(
  p_anon_token uuid,
  p_zone_id uuid,
  p_score int,
  p_ts timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if p_score < 0 or p_score > 100 then
    raise exception 'score out of range' using errcode = 'P0001';
  end if;

  select s.id into v_session_id
  from public.sessions s
  where s.anon_token = p_anon_token
    and s.zone_id = p_zone_id
    and s.user_id = auth.uid()
    and s.end_ts is null;

  if v_session_id is null then
    raise exception 'invalid or inactive session' using errcode = 'P0002';
  end if;

  insert into public.score_pings (session_id, ts, score)
  values (v_session_id, p_ts, p_score);
end;
$$;

revoke all on function public.ingest_score_ping(uuid, uuid, int, timestamptz) from public;
grant execute on function public.ingest_score_ping(uuid, uuid, int, timestamptz) to authenticated;

-- Rate limit (SR-1): a real device pings at most every few seconds; 12/min
-- (avg one every 5s) is generous headroom without allowing a flood.
create or replace function public.enforce_score_pings_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.score_pings
  where session_id = new.session_id
    and ts > now() - interval '60 seconds';

  if recent_count >= 12 then
    raise exception 'rate limit exceeded: too many score pings, try again shortly'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger score_pings_rate_limit_trigger
before insert on public.score_pings
for each row execute function public.enforce_score_pings_rate_limit();
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: migration `0016_score_ping_ingest` applies cleanly with no errors.

- [ ] **Step 3: Write the pgTAP tests**

```sql
-- supabase/tests/database/012_score_ping_ingest.sql
begin;
select plan(7);

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

select * from finish();
rollback;
```

- [ ] **Step 4: Run the tests**

Run: `npx supabase test db`
Expected: all 7 assertions in `012_score_ping_ingest.sql` pass (plus all pre-existing suites still green).

- [ ] **Step 5: Add a rate-limit boundary test**

```sql
-- append to supabase/tests/database/012_score_ping_ingest.sql, before `select * from finish();`
-- (bump `select plan(7);` to `select plan(9);` at the top of the file)

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
  'the 13th ping in 60s is rate-limited (1 from step 3 + 11 here = 12 already used)'
);
```

- [ ] **Step 6: Run the tests again**

Run: `npx supabase test db`
Expected: all 9 assertions pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0016_score_ping_ingest.sql supabase/tests/database/012_score_ping_ingest.sql
git commit -m "feat(db): add anon-token score-ping ingest RPC with rate limit (SR-1/SR-9)"
```

---

## Task 2: Shared types — anonToken on Session

**Files:**
- Modify: `packages/shared-types/src/session.ts`

- [ ] **Step 1: Add the field**

```typescript
export interface Session {
  id: string;
  userId: string;
  zoneId: string;
  startTs: string;
  endTs: string | null;
  intendedMinutes: number | null;
  achievedMinutes: number | null;
  finalScore: number | null;
  anonToken: string;
  createdAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace packages/shared-types`
Expected: passes (this is a pure interface change; nothing depends on the field yet).

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/session.ts
git commit -m "feat(shared-types): add anonToken to Session for score-ping ingest"
```

---

## Task 3: Mobile mappers + check-in service expose anon_token

**Files:**
- Modify: `apps/mobile/lib/mappers.ts`
- Modify: `apps/mobile/lib/checkin.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/mappers.test.ts (new file)
import { describe, expect, it } from "vitest";
import { toSession } from "./mappers";

describe("toSession", () => {
  it("maps anon_token to anonToken", () => {
    const session = toSession({
      id: "s1",
      user_id: "u1",
      zone_id: "z1",
      start_ts: "2026-01-01T00:00:00Z",
      end_ts: null,
      intended_minutes: null,
      achieved_minutes: null,
      final_score: null,
      anon_token: "tok-123",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(session.anonToken).toBe("tok-123");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace apps/mobile -- mappers.test.ts`
Expected: FAIL — `row.anon_token` not in the parameter type / `anonToken` is `undefined`.

- [ ] **Step 3: Update the mapper**

```typescript
// apps/mobile/lib/mappers.ts -- add anon_token to the toSession parameter type and return
export function toSession(row: {
  id: string;
  user_id: string;
  zone_id: string;
  start_ts: string;
  end_ts: string | null;
  intended_minutes: number | null;
  achieved_minutes: number | null;
  final_score: number | null;
  anon_token: string;
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
    anonToken: row.anon_token,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Update the SESSION_SELECT in checkin.ts**

```typescript
// apps/mobile/lib/checkin.ts
const SESSION_SELECT =
  "id, user_id, zone_id, start_ts, end_ts, intended_minutes, achieved_minutes, final_score, anon_token, created_at";
```

- [ ] **Step 5: Run the test again**

Run: `npm run test --workspace apps/mobile -- mappers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/mappers.ts apps/mobile/lib/mappers.test.ts apps/mobile/lib/checkin.ts
git commit -m "feat(mobile): expose session anon_token through check-in/check-out"
```

---

## Task 4: Pure scoring function (TDD core of this phase)

**Files:**
- Create: `apps/mobile/lib/scoring.ts`
- Create: `apps/mobile/lib/scoring.test.ts`

The score is a weighted blend of three signals, smoothed against the previous score so it doesn't jitter:
- `screenOffMs`: time since the screen turned off (saturates at 5 minutes → full credit)
- `interruptionFilter`: Android's `NotificationManager` constant (`1` = ALL, `2` = PRIORITY, `3` = NONE, `4` = ALARMS) — DND-ish states score higher
- `isForeground`: whether *any* app (including Hush) is in the foreground — being foregrounded at all means the phone is actively being looked at, so it scores low regardless of screen-off (screen-off and foreground can't both be true on a real device, but the function must not assume that)

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/lib/scoring.test.ts
import { describe, expect, it } from "vitest";
import { computeSilenceScore, type SilenceSignals } from "./scoring";

function signals(overrides: Partial<SilenceSignals> = {}): SilenceSignals {
  return {
    screenOffMs: 0,
    interruptionFilter: 1, // ALL -- no DND
    isForeground: false,
    ...overrides,
  };
}

describe("computeSilenceScore", () => {
  it("scores 0 when the screen just turned on and there is no prior score", () => {
    expect(computeSilenceScore(signals({ screenOffMs: 0 }), null)).toBe(0);
  });

  it("scores 100 when the screen has been off for 5+ minutes with DND on full alarms-only", () => {
    expect(
      computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), null)
    ).toBe(100);
  });

  it("scores partially for a screen-off duration under the 5-minute saturation point", () => {
    const score = computeSilenceScore(signals({ screenOffMs: 60_000 }), null);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(50);
  });

  it("forces a low score whenever any app is in the foreground, even with a long screen-off duration", () => {
    const score = computeSilenceScore(
      signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4, isForeground: true }),
      null
    );
    expect(score).toBeLessThanOrEqual(20);
  });

  it("smooths toward the new raw score rather than jumping instantly", () => {
    const raw = computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), null);
    const smoothed = computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), 0);
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(raw);
  });

  it("clamps to [0, 100]", () => {
    const score = computeSilenceScore(signals({ screenOffMs: 1_000_000_000 }), 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test --workspace apps/mobile -- scoring.test.ts`
Expected: FAIL — `Cannot find module './scoring'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/scoring.ts
// Pure function: raw device signals -> a smoothed 0-100 silence score. No
// network, no native calls -- this is the most testable unit in Phase 4 and
// is fixture-tested hard (PRD §7.1, Implementation Plan Phase 4).
export interface SilenceSignals {
  screenOffMs: number;
  // Android NotificationManager.getCurrentInterruptionFilter() constants:
  // 1 = ALL, 2 = PRIORITY, 3 = NONE, 4 = ALARMS.
  interruptionFilter: number;
  isForeground: boolean;
}

const SCREEN_OFF_SATURATION_MS = 5 * 60_000;
const SCREEN_OFF_WEIGHT = 0.6;
const INTERRUPTION_FILTER_WEIGHT = 0.4;
const SMOOTHING_ALPHA = 0.4; // new-score weight in the exponential blend

function interruptionFilterScore(filter: number): number {
  // ALL (1) contributes nothing; PRIORITY/NONE/ALARMS (2-4) step up.
  switch (filter) {
    case 4:
      return 100;
    case 3:
      return 75;
    case 2:
      return 50;
    default:
      return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeSilenceScore(signals: SilenceSignals, previousScore: number | null): number {
  if (signals.isForeground) {
    // Actively looking at any app overrides every other signal -- this is
    // the opposite of silence, regardless of recent screen-off history.
    return previousScore === null ? 0 : Math.round(previousScore * (1 - SMOOTHING_ALPHA));
  }

  const screenOffScore = clamp(signals.screenOffMs / SCREEN_OFF_SATURATION_MS, 0, 1) * 100;
  const filterScore = interruptionFilterScore(signals.interruptionFilter);
  const raw = clamp(screenOffScore * SCREEN_OFF_WEIGHT + filterScore * INTERRUPTION_FILTER_WEIGHT, 0, 100);

  if (previousScore === null) return Math.round(raw);

  const smoothed = previousScore + SMOOTHING_ALPHA * (raw - previousScore);
  return Math.round(clamp(smoothed, 0, 100));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace apps/mobile -- scoring.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/scoring.ts apps/mobile/lib/scoring.test.ts
git commit -m "feat(mobile): add fixture-tested silence scoring function"
```

---

## Task 5: Score-ingest client (SR-9 payload shape)

**Files:**
- Create: `apps/mobile/lib/ingest.ts`
- Create: `apps/mobile/lib/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/ingest.test.ts
import { describe, expect, it, vi } from "vitest";
import { sendScorePing } from "./ingest";

vi.mock("./supabase", () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) },
}));

describe("sendScorePing", () => {
  it("calls the ingest RPC with exactly the four allowed fields", async () => {
    const { supabase } = await import("./supabase");
    await sendScorePing({
      anonSessionToken: "tok-1",
      zoneId: "zone-1",
      score: 72,
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("ingest_score_ping", {
      p_anon_token: "tok-1",
      p_zone_id: "zone-1",
      p_score: 72,
      p_ts: "2026-01-01T00:00:00.000Z",
    });
    const callArgs = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(Object.keys(callArgs).sort()).toEqual(["p_anon_token", "p_score", "p_ts", "p_zone_id"]);
  });

  it("throws when the RPC returns an error", async () => {
    const { supabase } = await import("./supabase");
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "invalid or inactive session" },
    });
    await expect(
      sendScorePing({ anonSessionToken: "tok-1", zoneId: "zone-1", score: 50, ts: "2026-01-01T00:00:00.000Z" })
    ).rejects.toThrow("invalid or inactive session");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace apps/mobile -- ingest.test.ts`
Expected: FAIL — `Cannot find module './ingest'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/ingest.ts
import type { ScorePing } from "@hush/shared-types";
import { supabase } from "./supabase";

// The only allowed shape over the wire (SR-9 minimal ingest): nothing beyond
// these four fields is ever sent. The server resolves anonToken + zoneId to
// the caller's own active session (supabase/migrations/0016_score_ping_ingest.sql).
export async function sendScorePing(ping: ScorePing): Promise<void> {
  const { error } = await supabase.rpc("ingest_score_ping", {
    p_anon_token: ping.anonSessionToken,
    p_zone_id: ping.zoneId,
    p_score: ping.score,
    p_ts: ping.ts,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace apps/mobile -- ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/ingest.ts apps/mobile/lib/ingest.test.ts
git commit -m "feat(mobile): add minimal score-ingest client (SR-9)"
```

---

## Task 6: Native signal module (Android, Expo local module)

**Files:**
- Create: `apps/mobile/modules/silence-signals/expo-module.config.json`
- Create: `apps/mobile/modules/silence-signals/index.ts`
- Create: `apps/mobile/modules/silence-signals/android/build.gradle`
- Create: `apps/mobile/modules/silence-signals/android/src/main/java/expo/modules/silencesignals/SilenceSignalsModule.kt`
- Modify: `apps/mobile/package.json`

This module talks to Android-only APIs (`NotificationManager`, `UsageStatsManager`, `ACTION_SCREEN_OFF`/`ON` broadcasts). It cannot be exercised by Vitest — there is no JS-level logic to unit test, only OS calls — so this task's verification is a manual on-device check rather than TDD, same as any other native-module task. The function it feeds (`computeSilenceScore`, Task 4) is where the real test coverage lives.

- [ ] **Step 1: Register the local module**

```json
// apps/mobile/modules/silence-signals/expo-module.config.json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.silencesignals.SilenceSignalsModule"]
  }
}
```

- [ ] **Step 2: Write the JS bridge**

```typescript
// apps/mobile/modules/silence-signals/index.ts
import { requireNativeModule } from "expo-modules-core";

export interface NativeSilenceSignals {
  screenOffMs: number;
  interruptionFilter: number;
  isForeground: boolean;
}

interface SilenceSignalsNativeModule {
  getSignals(): Promise<NativeSilenceSignals>;
  hasUsageAccessPermission(): Promise<boolean>;
  openUsageAccessSettings(): void;
}

const NativeModule = requireNativeModule<SilenceSignalsNativeModule>("SilenceSignals");

export function getNativeSignals(): Promise<NativeSilenceSignals> {
  return NativeModule.getSignals();
}

export function hasUsageAccessPermission(): Promise<boolean> {
  return NativeModule.hasUsageAccessPermission();
}

export function openUsageAccessSettings(): void {
  NativeModule.openUsageAccessSettings();
}
```

- [ ] **Step 3: Write the Gradle file**

```gradle
// apps/mobile/modules/silence-signals/android/build.gradle
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

group = 'expo.modules.silencesignals'
version = '0.0.1'

android {
  namespace "expo.modules.silencesignals"
  compileSdkVersion safeExtGet("compileSdkVersion", 34)

  defaultConfig {
    minSdkVersion safeExtGet("minSdkVersion", 24)
    targetSdkVersion safeExtGet("targetSdkVersion", 34)
  }
}

dependencies {
  implementation project(':expo-modules-core')
}
```

- [ ] **Step 4: Write the Kotlin native module**

```kotlin
// apps/mobile/modules/silence-signals/android/src/main/java/expo/modules/silencesignals/SilenceSignalsModule.kt
package expo.modules.silencesignals

import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

// Tracks how long the screen has been off via a registered broadcast
// receiver rather than polling, so getSignals() is cheap to call frequently.
private object ScreenStateTracker {
  @Volatile private var screenOffSince: Long? = null

  fun onScreenOff() { screenOffSince = System.currentTimeMillis() }
  fun onScreenOn() { screenOffSince = null }
  fun screenOffDurationMs(): Long {
    val since = screenOffSince ?: return 0
    return System.currentTimeMillis() - since
  }
}

class SilenceSignalsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SilenceSignals")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      context.registerReceiver(
        object : BroadcastReceiver() {
          override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
              Intent.ACTION_SCREEN_OFF -> ScreenStateTracker.onScreenOff()
              Intent.ACTION_SCREEN_ON -> ScreenStateTracker.onScreenOn()
            }
          }
        },
        filter
      )
    }

    AsyncFunction("getSignals") {
      val context = appContext.reactContext ?: throw IllegalStateException("no react context")

      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val interruptionFilter = notificationManager.currentInterruptionFilter

      val isForeground = if (hasUsageAccess(context)) isAnyAppForeground(context) else false

      mapOf(
        "screenOffMs" to ScreenStateTracker.screenOffDurationMs(),
        "interruptionFilter" to interruptionFilter,
        "isForeground" to isForeground
      )
    }

    AsyncFunction("hasUsageAccessPermission") {
      hasUsageAccess(appContext.reactContext ?: throw IllegalStateException("no react context"))
    }

    Function("openUsageAccessSettings") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  private fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun isAnyAppForeground(context: Context): Boolean {
    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val end = System.currentTimeMillis()
    val start = end - TimeUnit.SECONDS.toMillis(30)
    val events = usageStatsManager.queryEvents(start, end)
    val event = UsageEvents.Event()
    var lastWasForeground = false
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        UsageEvents.Event.MOVE_TO_FOREGROUND -> lastWasForeground = true
        UsageEvents.Event.MOVE_TO_BACKGROUND -> lastWasForeground = false
      }
    }
    return lastWasForeground
  }
}
```

- [ ] **Step 5: Register the local module and rebuild the dev client**

```json
// apps/mobile/package.json -- dependencies
"expo-modules-core": "~2.2.0"
```

Run: `cd apps/mobile && npx expo prebuild --platform android --clean && npx expo run:android`
Expected: build succeeds; no Gradle errors about the `silence-signals` module.

- [ ] **Step 6: Manual on-device verification**

On the running emulator/device, with the app open: open a JS debugger console or a temporary log line and call `getNativeSignals()` (Task 7 wraps this) — turn the screen off and back on, confirm `screenOffMs` resets to `0` near `0` immediately after turning the screen back on and grows while off. Enable Do Not Disturb and confirm `interruptionFilter` changes from `1` to `3`/`4`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/modules/silence-signals apps/mobile/package.json
git commit -m "feat(mobile): add Android native module for screen-off/DND/foreground signals"
```

---

## Task 7: Signals wrapper with iOS fallback

**Files:**
- Create: `apps/mobile/lib/signals.ts`
- Create: `apps/mobile/lib/signals.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/signals.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../modules/silence-signals", () => ({
  getNativeSignals: vi.fn(),
}));

describe("getSilenceSignals on iOS", () => {
  it("returns an honor-system stub instead of calling the native module", async () => {
    const { getSilenceSignals } = await import("./signals");
    const { getNativeSignals } = await import("../modules/silence-signals");

    const signals = await getSilenceSignals(120_000);

    expect(getNativeSignals).not.toHaveBeenCalled();
    expect(signals).toEqual({ screenOffMs: 120_000, interruptionFilter: 1, isForeground: false });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace apps/mobile -- signals.test.ts`
Expected: FAIL — `Cannot find module './signals'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/signals.ts
import { Platform } from "react-native";
import { getNativeSignals, type NativeSilenceSignals } from "../modules/silence-signals";
import type { SilenceSignals } from "./scoring";

// Android: read real OS signals from the native module (Task 6).
// iOS: PRD §7.2 documented limitation -- no equivalent OS APIs are reachable
// from a third-party app. Fall back to an honor-system timer that credits
// elapsed in-session time as if the screen had been off the whole time, with
// no DND/foreground signal (interruptionFilter stays at "ALL", isForeground
// stays false) -- a flat, generous degrade rather than scoring 0.
export async function getSilenceSignals(elapsedSessionMs: number): Promise<SilenceSignals> {
  if (Platform.OS !== "android") {
    return { screenOffMs: elapsedSessionMs, interruptionFilter: 1, isForeground: false };
  }
  const native: NativeSilenceSignals = await getNativeSignals();
  return native;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace apps/mobile -- signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/signals.ts apps/mobile/lib/signals.test.ts
git commit -m "feat(mobile): add iOS honor-system fallback for silence signals"
```

---

## Task 8: Permission onboarding logic

**Files:**
- Create: `apps/mobile/lib/permissions.ts`
- Create: `apps/mobile/lib/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/permissions.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../modules/silence-signals", () => ({
  hasUsageAccessPermission: vi.fn(),
}));

describe("needsSilenceAgentOnboarding", () => {
  it("is false on iOS regardless of permission state (no native agent there)", async () => {
    vi.doMock("react-native", () => ({ Platform: { OS: "ios" } }));
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    expect(await needsSilenceAgentOnboarding()).toBe(false);
  });

  it("is true on Android when usage access has not been granted", async () => {
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    const { hasUsageAccessPermission } = await import("../modules/silence-signals");
    (hasUsageAccessPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    expect(await needsSilenceAgentOnboarding()).toBe(true);
  });

  it("is false on Android once usage access is granted", async () => {
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    const { hasUsageAccessPermission } = await import("../modules/silence-signals");
    (hasUsageAccessPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    expect(await needsSilenceAgentOnboarding()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace apps/mobile -- permissions.test.ts`
Expected: FAIL — `Cannot find module './permissions'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/permissions.ts
import { Platform } from "react-native";
import { hasUsageAccessPermission } from "../modules/silence-signals";

// Whether the user needs to see the permission-onboarding screen (Design
// Brief Flow A.01d) before their first check-in starts the silence agent.
// Permissions are revocable, so this is re-checked every time, not cached.
export async function needsSilenceAgentOnboarding(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const granted = await hasUsageAccessPermission();
  return !granted;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test --workspace apps/mobile -- permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/permissions.ts apps/mobile/lib/permissions.test.ts
git commit -m "feat(mobile): add silence-agent permission onboarding check"
```

---

## Task 9: Shared theme tokens

**Files:**
- Create: `apps/mobile/lib/theme.ts`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Add the font packages**

```json
// apps/mobile/package.json -- dependencies
"@expo-google-fonts/hanken-grotesk": "^0.4.1",
"@expo-google-fonts/newsreader": "^0.4.1",
"expo-font": "~13.0.1"
```

- [ ] **Step 2: Write the theme tokens**

```typescript
// apps/mobile/lib/theme.ts
// Design Brief §2 palette + type system. Centralized so the two Phase 4
// screens (and later phases) don't re-hardcode the same hex values.
export const colors = {
  ink: "#22201D",
  charcoal: "#4A463F",
  paper: "#F5F1EA",
  surface: "#FBF8F2",
  night: "#16140F",
  nightCard: "#23201A",
  accent: "#6B7F6E",
  border: "#E4DDD1",
  mutedText: "#8A8478",
  nightMutedText: "#8A7E6C",
  nightBorder: "#34301F",
} as const;

export const fonts = {
  hero: "Newsreader_300Light",
  body: "HankenGrotesk_400Regular",
  bodySemiBold: "HankenGrotesk_600SemiBold",
} as const;
```

- [ ] **Step 3: Load fonts in App.tsx**

```typescript
// apps/mobile/App.tsx -- add font loading before the existing screen state machine
import { useFonts } from "expo-font";
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk";
import { Newsreader_300Light } from "@expo-google-fonts/newsreader";

// inside the App component, before the existing auth effect:
const [fontsLoaded] = useFonts({
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
  Newsreader_300Light,
});

// guard the existing return so nothing renders custom fonts before they're ready:
if (!fontsLoaded) return null;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/theme.ts apps/mobile/package.json apps/mobile/App.tsx
git commit -m "feat(mobile): add Design Brief theme tokens and load Hanken Grotesk/Newsreader"
```

---

## Task 10: Permission onboarding screen (Flow A.01d)

**Files:**
- Create: `apps/mobile/screens/PermissionOnboardingScreen.tsx`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Write the screen**

```typescript
// apps/mobile/screens/PermissionOnboardingScreen.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openUsageAccessSettings } from "../modules/silence-signals";
import { colors, fonts } from "../lib/theme";

export function PermissionOnboardingScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>A couple of{"\n"}plain-language asks.</Text>
      <View style={styles.rows}>
        <PermissionRow
          title="Usage access"
          description="To privately score how quiet your phone is during a session. We don't see app names or content -- only a 0-100 number."
        />
        <PermissionRow
          title="Gentle nudges"
          description="Only soft session reminders. Never a red badge."
        />
      </View>
      <View style={styles.footer}>
        <Pressable
          style={styles.button}
          onPress={() => {
            openUsageAccessSettings();
            onContinue();
          }}
        >
          <Text style={styles.buttonText}>Allow & continue</Text>
        </Pressable>
        <Text style={styles.footerHint}>You can change these anytime in Settings.</Text>
      </View>
    </View>
  );
}

function PermissionRow({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 28, justifyContent: "space-between" },
  title: { fontFamily: fonts.hero, fontSize: 27, lineHeight: 33, color: colors.ink, marginTop: 24 },
  rows: { marginTop: 28, gap: 16 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    gap: 13,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#EFE9DD" },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.ink },
  rowDescription: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedText, marginTop: 2, lineHeight: 17 },
  footer: { paddingBottom: 12 },
  button: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.surface },
  footerHint: { fontFamily: fonts.body, fontSize: 12, color: "#9A9182", textAlign: "center", marginTop: 14 },
});
```

- [ ] **Step 2: Wire it into App.tsx ahead of check-in**

```typescript
// apps/mobile/App.tsx
// Add to the Screen union:
//   | { name: "permissionOnboarding"; zone: Zone }
//
// Replace the existing onSelectZone handler on MapScreen with:
import { needsSilenceAgentOnboarding } from "./lib/permissions";

async function handleSelectZone(zone: Zone) {
  if (await needsSilenceAgentOnboarding()) {
    setScreen({ name: "permissionOnboarding", zone });
  } else {
    setScreen({ name: "zoneDetail", zone });
  }
}

// Add the rendering branch next to the existing screen.name checks:
{screen.name === "permissionOnboarding" && (
  <PermissionOnboardingScreen onContinue={() => setScreen({ name: "zoneDetail", zone: screen.zone })} />
)}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/screens/PermissionOnboardingScreen.tsx apps/mobile/App.tsx
git commit -m "feat(mobile): add permission onboarding screen before first check-in"
```

---

## Task 11: Active session screen — live score loop + restyle (Flow C.05)

**Files:**
- Modify: `apps/mobile/screens/ActiveSessionScreen.tsx`

- [ ] **Step 1: Replace the screen with the scoring loop + restyle**

```typescript
// apps/mobile/screens/ActiveSessionScreen.tsx
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { checkOutSession } from "../lib/checkin";
import { getSilenceSignals } from "../lib/signals";
import { computeSilenceScore } from "../lib/scoring";
import { sendScorePing } from "../lib/ingest";
import { colors, fonts } from "../lib/theme";

const PING_INTERVAL_MS = 15_000;

export function ActiveSessionScreen({
  session,
  onCheckedOut,
}: {
  session: Session;
  onCheckedOut: (session: Session) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const breath = useRef(new Animated.Value(1)).current;
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let previousScore: number | null = null;

    async function tick() {
      const elapsed = Date.now() - startedAt.current;
      const signals = await getSilenceSignals(elapsed);
      const score = computeSilenceScore(signals, previousScore);
      previousScore = score;
      if (cancelled) return;
      setLiveScore(score);
      setElapsedMs(elapsed);
      try {
        await sendScorePing({
          anonSessionToken: session.anonToken,
          zoneId: session.zoneId,
          score,
          ts: new Date().toISOString(),
        });
      } catch {
        // A dropped ping is not fatal -- the next interval tries again.
        // Never surface ingest errors to the calm session UI.
      }
    }

    tick();
    const interval = setInterval(tick, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session.anonToken, session.zoneId]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1.14, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breath, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      animation.start();
    });
    return () => animation?.stop();
  }, [breath]);

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

  const remainingLabel = formatRemaining(session.intendedMinutes, elapsedMs);

  return (
    <View style={styles.container}>
      <Text style={styles.zoneLabel}>Quiet now</Text>
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.orbHalo, { transform: [{ scale: breath }] }]} />
        <View style={styles.orbCore}>
          <Text style={styles.orbScore}>{liveScore ?? "--"}</Text>
          <Text style={styles.orbLabel}>YOUR SILENCE</Text>
        </View>
      </View>
      <Text style={styles.hint}>Phone resting. Tap only to check out.</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{remainingLabel}</Text>
          <Text style={styles.tileLabel}>REMAINING</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, { color: "#E8C170" }]}>{liveScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>YOUR SILENCE</Text>
        </View>
      </View>
      <Pressable style={styles.button} onPress={handleCheckOut} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Checking out…" : "Check out"}</Text>
      </Pressable>
    </View>
  );
}

function formatRemaining(intendedMinutes: number | null, elapsedMs: number): string {
  if (!intendedMinutes) return "--:--";
  const remainingMs = Math.max(0, intendedMinutes * 60_000 - elapsedMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night, padding: 24, alignItems: "center", justifyContent: "center" },
  zoneLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: "#8A7A54", textTransform: "uppercase" },
  orbWrap: { width: 208, height: 208, alignItems: "center", justifyContent: "center", marginVertical: 24 },
  orbHalo: { position: "absolute", width: 208, height: 208, borderRadius: 104, backgroundColor: "rgba(232,193,112,0.25)" },
  orbCore: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#E0B86A",
    alignItems: "center",
    justifyContent: "center",
  },
  orbScore: { fontFamily: fonts.hero, fontSize: 54, color: "#3E3320" },
  orbLabel: { fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 2, color: "#6E5A30", marginTop: 2 },
  hint: { fontFamily: fonts.body, fontSize: 14, color: "#C9C0AE", textAlign: "center", marginBottom: 24 },
  errorText: { fontFamily: fonts.body, color: "#B07A5E", marginBottom: 16 },
  tiles: { flexDirection: "row", gap: 12, marginBottom: 18, width: "100%", maxWidth: 280 },
  tile: { flex: 1, backgroundColor: colors.nightCard, borderRadius: 16, padding: 14, alignItems: "center" },
  tileValue: { fontFamily: fonts.hero, fontSize: 26, color: "#F2ECE0" },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.5, color: colors.nightMutedText, marginTop: 4 },
  button: { backgroundColor: "#E8C170", borderRadius: 16, paddingVertical: 15, paddingHorizontal: 32 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.night },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace apps/mobile`
Expected: passes.

- [ ] **Step 3: Run the full mobile test suite**

Run: `npm run test --workspace apps/mobile`
Expected: all suites pass (scoring, ingest, signals, permissions, mappers, validation).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/screens/ActiveSessionScreen.tsx
git commit -m "feat(mobile): wire live silence-score loop into the in-zone session screen"
```

---

## Task 12: Manual on-device verification (full loop)

**Files:** none — this is a verification task, not a code task. Per project convention, a phase isn't done until it's been run for real on a device (see Phase 3's build fixes from this same plan's predecessor work).

- [ ] **Step 1: Rebuild and run on Android**

Run: `cd apps/mobile && npx expo run:android`
Expected: app builds and launches on emulator/device.

- [ ] **Step 2: Walk the golden path**

1. Open the app, select the demo zone → permission onboarding screen appears (Flow A.01d styling: paper background, two permission rows, "Allow & continue").
2. Tap "Allow & continue" → Android Usage Access settings opens; grant access to Hush; return to the app.
3. Check in with an optional intention.
4. On the active session screen (Night background, breathing orb, REMAINING/YOUR SILENCE tiles), lock the phone for 60+ seconds.
5. Unlock → confirm the displayed score has risen compared to right after check-in.
6. Tap "Check out" → confirm the screen transitions away without error.

- [ ] **Step 3: Confirm privacy by construction**

In the Supabase Studio (local) `score_pings` table, confirm only `id`, `session_id`, `ts`, `score` columns are populated — no app names, no content. Confirm via `npx supabase logs db` (or the dashboard) that the `ingest_score_ping` calls during the walkthrough carried only `p_anon_token`, `p_zone_id`, `p_score`, `p_ts`.

- [ ] **Step 4: Confirm reduced motion**

On the device, enable Settings → Accessibility → Remove animations (or equivalent), reopen the active session screen, and confirm the orb halo is static (no breathing).

- [ ] **Step 5: No commit** — this task only verifies Tasks 1–11; if anything fails, fix forward in a new commit on the relevant task and re-run this verification.

---

## Self-review

**Spec coverage** (Implementation Plan Phase 4 key tasks):
- Native module reading screen-off/DND/foreground → Task 6.
- Pure, fixture-tested scoring function → Task 4.
- Permission onboarding UI in plain language, revocable → Tasks 8, 10 (revocable: re-checked every time in `needsSilenceAgentOnboarding`, not cached).
- Score-ingest client posting only the 4 allowed fields, endpoint rejects extra fields, rate-limited → Tasks 1, 5 (RPC signature is a closed set of params; rate limit trigger).
- Candidate earning input tagging for Phase 6, no client-side crediting → satisfied by design: `score_pings` is the only artifact written, no wallet/points code touched in this phase.
- iOS fallback stub → Task 7.
- Exit criteria: scoring unit tests (Task 4), ingest rejects over-posting (Task 1 Step 3 test: direct insert now fails, RPC signature is closed), permission flow works (Task 12), iOS degrades gracefully (Task 7).
- Security gates SR-1 (Task 1 rate limit), SR-4 (RPC's closed parameter list), SR-9 (Task 1 + Task 5 payload-shape test), and the explicit "payload contains only the four allowed fields" test (Task 5 Step 1).

**Placeholder scan:** no TBD/TODO; every step has real code or an exact command.

**Type consistency:** `SilenceSignals` (Task 4: `screenOffMs`, `interruptionFilter`, `isForeground`) matches `NativeSilenceSignals` (Task 6) and the iOS stub (Task 7) field-for-field. `ScorePing` (existing shared type: `anonSessionToken`/`zoneId`/`score`/`ts`) is used consistently: Task 5's `sendScorePing` reads `ping.anonSessionToken`, and Task 11's call site builds `{ anonSessionToken: session.anonToken, ... }` — `Session.anonToken` (Task 2) feeding into `ScorePing.anonSessionToken` (the wire type), matching the deliberate distinction documented in `packages/shared-types/src/score-ping.ts`.
