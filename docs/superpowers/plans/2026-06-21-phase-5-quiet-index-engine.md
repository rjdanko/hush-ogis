# Phase 5 — Quiet Index Engine & Realtime Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server aggregates anonymized scores into a live Quiet Index per zone and pushes it to the mobile map and operator dashboard within ≤60s, while keeping the per-user score stream usable (but never publicly attributable) for Phase 6 point accrual.

**Architecture decision:** The aggregation engine lives entirely inside Postgres, not as a new always-on Node/Python process. `public.compute_quiet_index_rollups()` is a `security definer` SQL function — the **pure, fixture-tested unit** the PRD calls for, with "fixture" meaning deterministic pgTAP fixtures (known sessions/score_pings inserted, exact expected `value`/`active_count` asserted), the same discipline Phase 1 used for RLS and Phase 4 used for the on-device scoring function, just expressed in SQL instead of TypeScript because the computation has to run where the data already lives and no extra service is in the monorepo's architecture for it. `pg_cron` (already bundled in the local Postgres image, just not yet `create extension`-ed) ticks the function every 15s — three times inside the 60s NFR budget, so one missed tick never threatens the latency bar. Quorum (SR-10) is enforced by the function simply not inserting a row when fewer than 3 sessions are live; there is no code path a client request can take to force a write, satisfying "not bypassable by a client." Broadcasting reuses Supabase Realtime's `postgres_changes`: adding `quiet_index` to the `supabase_realtime` publication means every `INSERT` is pushed to subscribed clients over the existing websocket, no bespoke pub/sub needed. Mobile and dashboard each get a thin subscription hook; neither computes anything client-side.

**Tech Stack:** `pg_cron` 1.6 + `pgtap` (pgTAP fixture tests via `npx supabase test db`) · Supabase Realtime `postgres_changes` · React Native (`MapScreen`) + Next.js client component (dashboard zone page) · Vitest for the two new client-side subscription helpers.

---

## Task 1: DB — aggregation engine, quorum guard, cron schedule

**Files:**
- Create: `supabase/migrations/0017_quiet_index_engine.sql`
- Create: `supabase/tests/database/013_quiet_index_engine.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0017_quiet_index_engine.sql

create extension if not exists pg_cron;

-- Aggregates each zone's currently-live sessions into one quiet_index row.
-- "Live" = an active session (end_ts is null) whose most recent score_ping
-- is within ACTIVE_WINDOW (45s = 3x the mobile client's 15s ping interval,
-- so one dropped ping doesn't flicker a session in and out of the count).
-- Quorum (SR-10): fewer than 3 live sessions in a zone -> no row at all for
-- that tick. This is the only write path into quiet_index (0007_quiet_index.sql
-- grants no insert to anon/authenticated), so there is no client request that
-- can force a broadcast below quorum.
create or replace function public.compute_quiet_index_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_window interval := interval '45 seconds';
begin
  with latest_ping as (
    select
      sp.session_id,
      sp.score,
      sp.ts,
      row_number() over (partition by sp.session_id order by sp.ts desc) as rn
    from public.score_pings sp
  ),
  live_session as (
    select
      s.zone_id,
      lp.score,
      -- weight decays linearly to 0 across the active window so a session's
      -- influence fades out smoothly rather than cutting off at a hard edge
      greatest(0, 1 - extract(epoch from (now() - lp.ts)) / extract(epoch from active_window)) as weight
    from latest_ping lp
    join public.sessions s on s.id = lp.session_id
    where lp.rn = 1
      and s.end_ts is null
      and lp.ts >= now() - active_window
  ),
  per_zone as (
    select
      zone_id,
      count(*) as active_count,
      sum(score * weight) / sum(weight) as value
    from live_session
    group by zone_id
    having sum(weight) > 0
  )
  insert into public.quiet_index (zone_id, value, active_count)
  select zone_id, round(value::numeric, 1), active_count
  from per_zone
  where active_count >= 3;
end;
$$;

-- Only the cron job (running as the function owner via security definer)
-- ever calls this; no client role needs execute.
revoke execute on function public.compute_quiet_index_rollups() from public, anon, authenticated;

select cron.schedule('quiet-index-tick', '15 seconds', $$select public.compute_quiet_index_rollups();$$);

-- Realtime: let app + dashboard subscribe to new rollups via postgres_changes.
-- quiet_index already has RLS enabled with a public-read policy (0007), so
-- this only adds the WAL-level broadcast on top of an already-readable table.
alter publication supabase_realtime add table public.quiet_index;
```

- [ ] **Step 2: Run it**

```
npx supabase migration up
```

(If the local stack is already running from `supabase start`, `migration up` applies pending migrations against it; use `npx supabase db reset` instead if you want a clean rebuild including the seed.)

## Task 2: pgTAP fixtures for the engine

**Files:**
- Create: `supabase/tests/database/013_quiet_index_engine.sql`

This is the "pure, fixture-tested unit" requirement: every case below inserts known `sessions`/`score_pings` rows, calls `compute_quiet_index_rollups()` once, and asserts the exact resulting `quiet_index` row (or its absence). Follow `000_helpers.sql`'s existing fixture helpers (demo zone/users) and the boundary-test style already used in `009_sessions_rate_limit.sql`.

- [ ] **Step 1: Quorum boundary — 2 vs 3 active sessions**
  - Insert 2 sessions in zone A, each with a score_ping `now()`. Run the function. Assert: no `quiet_index` row for zone A (`results_eq` against an empty set, per the [[hush-phase-1-rls-testing-gotchas]] note that `results_eq` — not `throws_ok` — is the right matcher here).
  - Insert a 3rd session + ping in the same zone. Run the function again. Assert: exactly one row, `active_count = 3`.
- [ ] **Step 2: Decay weighting correctness**
  - 3 sessions with scores `90, 90, 90` all pinged at `now()` → assert `value = 90.0`.
  - 3 sessions with scores `100, 100, 100`, one of them pinged 30s ago (weight `1 - 30/45 = 1/3`) → compute the expected weighted average by hand and assert the exact rounded value, proving the decay formula (not just "some number near 100").
- [ ] **Step 3: Staleness excludes a session from quorum**
  - 3 sessions, one with its latest ping 60s old (older than the 45s window) → assert only 2 are counted, so **no** row is inserted (quorum not met) even though 3 sessions exist.
- [ ] **Step 4: Ended sessions are excluded even with a fresh ping**
  - 3 sessions meet quorum; a 4th has `end_ts` set but a score_ping from 1 second ago → assert `active_count` is still 3, not 4 (a checked-out session's trailing ping must never count).
- [ ] **Step 5: Zone isolation**
  - Zone A has 3 live sessions, zone B has 2 → assert a row exists for A and not for B in the same function call (one cron tick must handle every zone independently, not globally).
- [ ] **Step 6: Re-running appends, not upserts**
  - Run the function twice in a row with the same fixture → assert 2 rows now exist for the zone (each tick is a new history point, matching `quiet_index`'s append-only design — there's no unique constraint on `zone_id` to upsert against, and there shouldn't be: the dashboard/app want a time series, not just "latest").

Run: `npx supabase test db`

## Task 3: mobile — replace the map's placeholder Quiet Index with the live value

**Files:**
- Create: `apps/mobile/lib/quietIndex.ts`
- Create: `apps/mobile/lib/quietIndex.test.ts`
- Edit: `apps/mobile/screens/MapScreen.tsx`

- [ ] **Step 1 (RED): write `quietIndex.test.ts`** covering:
  - `fetchLatestQuietIndex(zoneId)` selects the most recent `quiet_index` row for that zone, returns `null` when none exists yet (quorum never met) — mock the Supabase client's `.from().select().eq().order().limit()` chain.
  - `subscribeToQuietIndex(zoneId, onUpdate)` opens a `postgres_changes` channel filtered to `zone_id=eq.<id>` and `event: "INSERT"`, calling `onUpdate(value)` with the new row's `value`; returns an unsubscribe function that calls `channel.unsubscribe()`.
- [ ] **Step 2 (GREEN): implement `lib/quietIndex.ts`**

```ts
import { supabase } from "./supabase";

export async function fetchLatestQuietIndex(zoneId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("quiet_index")
    .select("value")
    .eq("zone_id", zoneId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.value) : null;
}

export function subscribeToQuietIndex(zoneId: string, onUpdate: (value: number) => void): () => void {
  const channel = supabase
    .channel(`quiet-index:${zoneId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "quiet_index", filter: `zone_id=eq.${zoneId}` },
      (payload) => onUpdate(Number(payload.new.value))
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}
```

- [ ] **Step 3: wire `MapScreen.tsx`**
  - Remove `PLACEHOLDER_QUIET_INDEX`.
  - On mount (and whenever `zones` changes), for each zone call `fetchLatestQuietIndex` for the initial bloom color and open a `subscribeToQuietIndex` channel; keep a `Record<zoneId, number | null>` in state, unsubscribe all channels on unmount.
  - When a zone's value is `null` (no quorum yet reached for that zone), render the bloom at a dim neutral baseline rather than `quietIndexGlowColor(0)` — a silent zone is not the same as a "noisy" one on the glow scale; add a short comment explaining the distinction so it isn't "fixed" back to 0 later.
- [ ] **Step 4:** `npm test --workspace apps/mobile -- quietIndex`

## Task 4: dashboard — live Quiet Index card on the zone page

**Files:**
- Create: `apps/dashboard/lib/quiet-index.ts`
- Create: `apps/dashboard/tests/quiet-index.test.ts`
- Create: `apps/dashboard/components/LiveQuietIndex.tsx`
- Edit: `apps/dashboard/app/(dashboard)/zones/[id]/page.tsx`

- [ ] **Step 1 (RED):** `quiet-index.test.ts` covers a pure `formatQuietIndex(value: number | null): string` helper (e.g. `"—"` when `null`/no quorum yet, otherwise the rounded integer + `"/100"`) — mirrors the mobile lib's split between pure formatting and the Supabase IO, so the one piece of actual logic here is unit-tested without mocking a channel.
- [ ] **Step 2 (GREEN):** implement `lib/quiet-index.ts` with `formatQuietIndex` plus a `fetchLatestQuietIndex(supabase, zoneId)` helper analogous to the mobile one (reuses the page's existing server-side Supabase client for the initial value).
- [ ] **Step 3:** `ZoneDetailPage` (`zones/[id]/page.tsx`) fetches the initial latest value server-side via `fetchLatestQuietIndex` and passes it into `ZoneEditClient` as `initialQuietIndex`.
- [ ] **Step 4:** add `components/LiveQuietIndex.tsx`, a small `"use client"` component that takes `zoneId` + `initialValue`, renders `formatQuietIndex(value)`, and on mount opens a Supabase Realtime channel (browser client from `lib/supabase/client.ts`) subscribed the same way as the mobile helper, updating local state on each `INSERT`; unsubscribes on unmount.
- [ ] **Step 5:** render `<LiveQuietIndex zoneId={zone.id} initialValue={initialQuietIndex} />` near the top of `ZoneEditClient`'s returned JSX (above the `ZoneForm`), labelled "Live Quiet Index".
- [ ] **Step 6:** `npm test --workspace apps/dashboard -- quiet-index`

## Task 5: prove the ≤60s latency + quorum gate with a real multi-session demo

**Files:**
- Create: `scripts/simulate-quiet-index.mjs`

Per [[hush-phase-workflow-preferences]], this phase isn't done on green tests alone — drive the real local stack and watch the Quiet Index actually climb.

- [ ] **Step 1:** write `scripts/simulate-quiet-index.mjs`: using `@supabase/supabase-js` with the **anon** key (never service-role — SR-2 applies to demo tooling too), sign in 3 separate anonymous users, `insert` a `sessions` row for each against the seeded demo zone (`00000000-0000-0000-0000-00000000000a`), then loop every 15s sending each session's `ingest_score_ping` RPC with a rising score (e.g. start at 40, +10/tick capped at 95), logging the latest `quiet_index` row for the zone after each tick (poll `fetchLatestQuietIndex`-equivalent, since this is a standalone script, not a UI). Stop after ~6 ticks (90s) — enough to see quorum trip and the value rise with decay smoothing.
- [ ] **Step 2:** run it against the local stack (`npx supabase start`, `npm run dev:dashboard` in another terminal) and confirm in the script's own log: no row before the 3rd session joins, a row appears within one cron tick (≤15s, well inside the 60s NFR) of quorum being met, and the value trends upward as scores rise.
- [ ] **Step 3:** with the dev server running, open `/zones/00000000-0000-0000-0000-00000000000a` in a browser while the script runs and visually confirm the new `LiveQuietIndex` card updates without a manual refresh. Note the observed behavior (pass/fail, any gap) directly in the phase commit message or a follow-up note — don't claim this step passed without having actually watched it update.

## Exit criteria checklist

- [ ] `npx supabase test db` green, including all of Task 2's fixtures (engine correctness + quorum boundary, tested both ways).
- [ ] `npm run typecheck` and each workspace's `npm test` green.
- [ ] Quorum verified server-side and not bypassable by a client (no insert/execute grant exists for any client role — confirm by reading the migration, not just the tests).
- [ ] Realtime updates observed on both mobile (`MapScreen`) and dashboard (`LiveQuietIndex`) per Task 5 Step 3.
- [ ] Score stream (`score_pings`) untouched by this phase — still readable per-session for Phase 6, never exposed in any public/aggregate response.
- [ ] Commit directly to `master` (no worktree) per [[hush-phase-workflow-preferences]].
