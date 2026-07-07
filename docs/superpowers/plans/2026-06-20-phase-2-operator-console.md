# Phase 2 — Operator Console: Zone Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator can sign in to the Next.js dashboard, draw a zone polygon on a map, set a silence contract + reward, and persist it through RLS-guarded, rate-limited, validated API routes — giving Phase 3 (mobile) real data to consume.

**Architecture:** All authorization is Postgres RLS (already enforced from Phase 1 on `zones`/`rewards` — see [supabase/tests/database/003_zones_rls.sql](../../../supabase/tests/database/003_zones_rls.sql) and [007_rewards_rls.sql](../../../supabase/tests/database/007_rewards_rls.sql)). The dashboard never uses the service-role key (SR-2): every write goes through a Next.js Route Handler that (1) re-derives the caller's identity server-side from the Supabase session cookie via `@supabase/ssr` — never trusting client-supplied IDs — (2) validates the request body with `zod`, (3) applies an in-memory per-user rate limit, then (4) performs the write with a session-scoped Supabase client (the user's own JWT), so Postgres RLS is what actually decides whether the write is allowed. Middleware redirects unauthenticated browser requests to `/login` for UX, but every Route Handler independently re-checks the session — redirect is not the security boundary (SR-3/SR-8). Polygon validation logic (ring closing, vertex cap, coordinate bounds) is a pure, unit-tested module shared by the zod schema and the map editor component, mirroring the DB's own `st_npoints <= 64` check (defense in depth, not a replacement for it).

**Tech Stack:** Next.js 15 App Router (already scaffolded) · `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.108 (browser/server session-aware clients) · `zod` 4.4 (request validation) · `mapbox-gl` 3.25 + `@mapbox/mapbox-gl-draw` 1.5 (polygon draw UI) · `vitest` 4.1 + `jsdom` (new test runner for this package — nothing in `apps/dashboard` is tested yet).

**Environment notes (verified this session):** Local Supabase stack is running (`npx supabase status` succeeds; Postgres reachable via `docker exec supabase_db_hush-local psql ...`). `pgcrypto` is already enabled in the `extensions` schema (confirmed via `pg_extension`), so the seed can hash a real demo password with `extensions.crypt(text, extensions.gen_salt('bf'))` — GoTrue verifies bcrypt hashes produced this way. The current seed sets `encrypted_password = ''` for the demo operator, which cannot authenticate; Task 2 fixes this.

---

## File structure produced by this plan

```
apps/dashboard/
├─ package.json                      # + @supabase/ssr, @supabase/supabase-js, zod, mapbox-gl,
│                                     #   @mapbox/mapbox-gl-draw, vitest, jsdom, @vitejs/plugin-react
├─ vitest.config.ts
├─ middleware.ts                      # session refresh + UX redirect to /login
├─ lib/
│  ├─ supabase/
│  │  ├─ client.ts                    # browser client
│  │  └─ server.ts                    # server client (cookies-based) for Route Handlers/Server Components
│  ├─ rate-limit.ts                   # in-memory fixed-window limiter
│  ├─ geo.ts                          # pure polygon helpers (closeRing, polygon validation)
│  └─ validation/
│     ├─ zone.ts                      # zod schemas for zone create/update
│     └─ reward.ts                    # zod schemas for reward create/update
├─ app/
│  ├─ login/
│  │  ├─ page.tsx                     # email/password form (client component)
│  │  └─ actions.ts                   # server action: signInWithPassword
│  ├─ (dashboard)/
│  │  ├─ layout.tsx                   # server component: require session, render nav + sign-out
│  │  ├─ zones/
│  │  │  ├─ page.tsx                  # list this operator's zones
│  │  │  ├─ new/page.tsx              # create zone (map + form)
│  │  │  └─ [id]/page.tsx             # edit zone + manage its rewards
│  └─ api/
│     ├─ zones/
│     │  ├─ route.ts                  # POST create
│     │  └─ [id]/route.ts             # PATCH update, DELETE
│     └─ rewards/
│        ├─ route.ts                  # POST create
│        └─ [id]/route.ts             # PATCH update, DELETE
├─ components/
│  ├─ ZoneMapEditor.tsx               # mapbox-gl + mapbox-gl-draw client component
│  ├─ ZoneForm.tsx
│  └─ RewardForm.tsx
└─ tests/
   ├─ geo.test.ts
   ├─ rate-limit.test.ts
   ├─ validation/zone.test.ts
   ├─ validation/reward.test.ts
   ├─ api/zones.test.ts
   └─ api/rewards.test.ts

supabase/seed/seed.sql                # set a real bcrypt demo password
.env.example                          # + NEXT_PUBLIC_MAPBOX_TOKEN
```

---

## Task 1: Test runner + dependencies for `apps/dashboard`

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/vitest.config.ts`
- Create: `apps/dashboard/tests/smoke.test.ts`

- [ ] **Step 1: Add dependencies**

Edit `apps/dashboard/package.json`:

```json
{
  "name": "@hush/dashboard",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/ssr": "^0.12.0",
    "@supabase/supabase-js": "^2.108.0",
    "@hush/shared-types": "*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^4.4.0",
    "mapbox-gl": "^3.25.0",
    "@mapbox/mapbox-gl-draw": "^1.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/mapbox-gl": "^3.4.0",
    "@vitejs/plugin-react": "^4.1.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^29.1.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Create the vitest config**

```ts
// apps/dashboard/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Write a smoke test to confirm the runner works**

```ts
// apps/dashboard/tests/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("vitest runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Install and run**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npm install
npm run test --workspace apps/dashboard
```
Expected: `1 passed` for the smoke test.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/vitest.config.ts apps/dashboard/tests/smoke.test.ts package-lock.json
git commit -m "chore(dashboard): add vitest runner and Phase 2 dependencies"
```

---

## Task 2: Give the demo operator a real password

The seeded operator (`demo-operator@hush.local`) currently has `encrypted_password = ''`, so it cannot sign in. Use pgcrypto (already enabled in the local stack) to set a bcrypt hash GoTrue can verify.

**Files:**
- Modify: `supabase/seed/seed.sql`

- [ ] **Step 1: Update the seed's `auth.users` insert**

```sql
-- supabase/seed/seed.sql
-- Demo operator + demo zone for downstream phases (Phase 2 dashboard, Phase 3 mobile map).
-- Demo login: demo-operator@hush.local / DemoOperator123! (local-only; never used outside this seed).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo-operator@hush.local',
  extensions.crypt('DemoOperator123!', extensions.gen_salt('bf')),
  now(), '{}'::jsonb, '{}'::jsonb,
  false, now(), now(), false, false
)
on conflict (id) do update set encrypted_password = excluded.encrypted_password;
```
(Leave the rest of the file — `operators`/`zones`/`rewards` inserts — unchanged.)

- [ ] **Step 2: Reset the local DB and verify the password works**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase db reset
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $(npx supabase status -o env | grep ANON_KEY | cut -d'"' -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo-operator@hush.local","password":"DemoOperator123!"}'
```
Expected: a JSON body containing `"access_token"` and `"refresh_token"`. If you instead get `"invalid_grant"`, the hash didn't take — re-check the `crypt`/`gen_salt` call matches the `extensions` schema name from `pg_extension`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed/seed.sql
git commit -m "fix(seed): set a real bcrypt password for the demo operator so dashboard login works"
```

---

## Task 3: Pure polygon validation helpers (`lib/geo.ts`)

This is the shared logic the zod schema (Task 5) and the map editor (Task 8) both call — write and test it standalone first.

**Files:**
- Create: `apps/dashboard/lib/geo.ts`
- Test: `apps/dashboard/tests/geo.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/dashboard/tests/geo.test.ts
import { describe, expect, it } from "vitest";
import { closeRing, MAX_POLYGON_VERTICES, validatePolygonRing } from "../lib/geo";

describe("closeRing", () => {
  it("appends the first point to close an open ring", () => {
    const ring: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(closeRing(ring)).toEqual([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]);
  });

  it("leaves an already-closed ring unchanged", () => {
    const ring: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
    expect(closeRing(ring)).toEqual(ring);
  });
});

describe("validatePolygonRing", () => {
  const validRing: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];

  it("accepts a valid closed ring with at least 4 points", () => {
    expect(validatePolygonRing(validRing)).toEqual({ ok: true });
  });

  it("rejects a ring with fewer than 4 points", () => {
    const result = validatePolygonRing([[0, 0], [0, 1], [0, 0]]);
    expect(result).toEqual({ ok: false, reason: "A polygon needs at least 3 distinct vertices." });
  });

  it("rejects a ring that isn't closed", () => {
    const result = validatePolygonRing([[0, 0], [0, 1], [1, 1], [1, 0]]);
    expect(result).toEqual({ ok: false, reason: "Polygon ring must be closed (first point must equal last point)." });
  });

  it(`rejects a ring with more than ${MAX_POLYGON_VERTICES} vertices`, () => {
    const tooMany: [number, number][] = Array.from({ length: MAX_POLYGON_VERTICES }, (_, i) => [i, 0]);
    tooMany.push(tooMany[0]!);
    const result = validatePolygonRing(tooMany);
    expect(result).toEqual({ ok: false, reason: `Polygon exceeds the ${MAX_POLYGON_VERTICES}-vertex cap.` });
  });

  it("rejects out-of-range longitude", () => {
    const result = validatePolygonRing([[200, 0], [0, 1], [1, 1], [200, 0]]);
    expect(result).toEqual({ ok: false, reason: "Longitude must be between -180 and 180." });
  });

  it("rejects out-of-range latitude", () => {
    const result = validatePolygonRing([[0, 95], [0, 1], [1, 1], [0, 95]]);
    expect(result).toEqual({ ok: false, reason: "Latitude must be between -90 and 90." });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace apps/dashboard`
Expected: FAIL — `Cannot find module '../lib/geo'`.

- [ ] **Step 3: Implement `lib/geo.ts`**

```ts
// apps/dashboard/lib/geo.ts
// Mirrors the DB-side cap in supabase/migrations/0004_zones.sql
// (`zones_geofence_vertex_cap check (st_npoints(geofence::geometry) <= 64)`).
// This is defense in depth, not a substitute for the DB constraint.
export const MAX_POLYGON_VERTICES = 64;

export type Point = [number, number];

export function closeRing(ring: Point[]): Point[] {
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }
  return first ? [...ring, first] : ring;
}

export type PolygonValidationResult = { ok: true } | { ok: false; reason: string };

export function validatePolygonRing(ring: Point[]): PolygonValidationResult {
  // A closed ring of N distinct vertices has N+1 points (first repeated as last).
  const distinctCount = ring.length > 0 ? ring.length - 1 : 0;
  if (distinctCount < 3) {
    return { ok: false, reason: "A polygon needs at least 3 distinct vertices." };
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { ok: false, reason: "Polygon ring must be closed (first point must equal last point)." };
  }
  if (ring.length > MAX_POLYGON_VERTICES) {
    return { ok: false, reason: `Polygon exceeds the ${MAX_POLYGON_VERTICES}-vertex cap.` };
  }
  for (const [lng, lat] of ring) {
    if (lng < -180 || lng > 180) {
      return { ok: false, reason: "Longitude must be between -180 and 180." };
    }
    if (lat < -90 || lat > 90) {
      return { ok: false, reason: "Latitude must be between -90 and 90." };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test --workspace apps/dashboard`
Expected: PASS, all `geo.test.ts` cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/geo.ts apps/dashboard/tests/geo.test.ts
git commit -m "feat(dashboard): add pure polygon validation helpers"
```

---

## Task 4: In-memory rate limiter (`lib/rate-limit.ts`)

**Files:**
- Create: `apps/dashboard/lib/rate-limit.ts`
- Test: `apps/dashboard/tests/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/dashboard/tests/rate-limit.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("user-1", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
  });

  it("blocks the request once the limit is exceeded", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-2", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-2", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("resets the count after the window elapses", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-4", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-4", "rewards:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace apps/dashboard`
Expected: FAIL — `Cannot find module '../lib/rate-limit'`.

- [ ] **Step 3: Implement `lib/rate-limit.ts`**

```ts
// apps/dashboard/lib/rate-limit.ts
// In-memory fixed-window limiter (SR-1). Scoped to a single Next.js server
// process -- correct for local dev / single-instance deployment; a multi-
// instance production deployment would need a shared store (e.g. Redis).
// That's a real gap, not a YAGNI call, but out of scope for this phase.
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
}

export function checkRateLimit(
  identity: string,
  action: string,
  options: RateLimitOptions
): RateLimitResult {
  const key = `${identity}:${action}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= options.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= options.limit) {
    return { allowed: false };
  }

  existing.count += 1;
  return { allowed: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test --workspace apps/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/rate-limit.ts apps/dashboard/tests/rate-limit.test.ts
git commit -m "feat(dashboard): add in-memory per-identity rate limiter"
```

---

## Task 5: Zod validation schemas for zones and rewards

**Files:**
- Create: `apps/dashboard/lib/validation/zone.ts`
- Create: `apps/dashboard/lib/validation/reward.ts`
- Test: `apps/dashboard/tests/validation/zone.test.ts`
- Test: `apps/dashboard/tests/validation/reward.test.ts`

- [ ] **Step 1: Write the failing zone schema tests**

```ts
// apps/dashboard/tests/validation/zone.test.ts
import { describe, expect, it } from "vitest";
import { zoneCreateSchema, zoneUpdateSchema } from "../../lib/validation/zone";

const validPolygon = {
  type: "Polygon" as const,
  coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] as [number, number][][],
};

describe("zoneCreateSchema", () => {
  it("accepts a valid zone payload", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: { suggested_minutes: 45 },
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70, daily_point_cap: 120 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = zoneCreateSchema.safeParse({
      name: "",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a polygon that isn't closed", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]] },
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects min_score_for_earning outside 0-100", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 150 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (strict schema, mirrors PRD ingest-endpoint posture)", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      operatorId: "00000000-0000-0000-0000-000000000099",
    });
    expect(result.success).toBe(false);
  });
});

describe("zoneUpdateSchema", () => {
  it("accepts a partial update (name only)", () => {
    const result = zoneUpdateSchema.safeParse({ name: "Renamed Cafe" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = zoneUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing reward schema tests**

```ts
// apps/dashboard/tests/validation/reward.test.ts
import { describe, expect, it } from "vitest";
import { rewardCreateSchema, rewardUpdateSchema } from "../../lib/validation/reward";

describe("rewardCreateSchema", () => {
  it("accepts a valid reward payload", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "Free coffee",
      pointsCost: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive pointsCost", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "Free coffee",
      pointsCost: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid zoneId", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "not-a-uuid",
      name: "Free coffee",
      pointsCost: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "",
      pointsCost: 50,
    });
    expect(result.success).toBe(false);
  });
});

describe("rewardUpdateSchema", () => {
  it("accepts a partial update (pointsCost only)", () => {
    const result = rewardUpdateSchema.safeParse({ pointsCost: 75 });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = rewardUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npm run test --workspace apps/dashboard`
Expected: FAIL — modules under `lib/validation/` don't exist yet.

- [ ] **Step 4: Implement `lib/validation/zone.ts`**

```ts
// apps/dashboard/lib/validation/zone.ts
import { z } from "zod";
import { closeRing, validatePolygonRing, type Point } from "../geo";

const pointSchema: z.ZodType<Point> = z.tuple([z.number(), z.number()]);

const geoJsonPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(pointSchema)).length(1, "Only single-ring polygons are supported (no holes)."),
  })
  .superRefine((polygon, ctx) => {
    const ring = closeRing(polygon.coordinates[0]!);
    const result = validatePolygonRing(ring);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason, path: ["coordinates"] });
    }
  });

const silenceContractSchema = z
  .object({
    suggested_minutes: z.number().int().positive().optional(),
  })
  .strict();

const rewardConfigSchema = z
  .object({
    earn_rate_per_quiet_minute: z.number().positive(),
    min_score_for_earning: z.number().min(0).max(100),
    daily_point_cap: z.number().int().positive().optional(),
  })
  .strict();

export const zoneCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    geofence: geoJsonPolygonSchema,
    silenceContract: silenceContractSchema,
    rewardConfig: rewardConfigSchema,
  })
  .strict();

export const zoneUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    geofence: geoJsonPolygonSchema.optional(),
    silenceContract: silenceContractSchema.optional(),
    rewardConfig: rewardConfigSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdateInput = z.infer<typeof zoneUpdateSchema>;
```

- [ ] **Step 5: Implement `lib/validation/reward.ts`**

```ts
// apps/dashboard/lib/validation/reward.ts
import { z } from "zod";

export const rewardCreateSchema = z
  .object({
    zoneId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    pointsCost: z.number().int().positive(),
  })
  .strict();

export const rewardUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    pointsCost: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

export type RewardCreateInput = z.infer<typeof rewardCreateSchema>;
export type RewardUpdateInput = z.infer<typeof rewardUpdateSchema>;
```

- [ ] **Step 6: Run to verify all pass**

Run: `npm run test --workspace apps/dashboard`
Expected: PASS, all `validation/*.test.ts` cases green.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/validation apps/dashboard/tests/validation
git commit -m "feat(dashboard): add zod validation schemas for zone and reward writes"
```

---

## Task 6: Supabase browser/server client helpers

**Files:**
- Create: `apps/dashboard/lib/supabase/client.ts`
- Create: `apps/dashboard/lib/supabase/server.ts`

No unit tests here — these are thin wrappers around `@supabase/ssr` whose correctness is exercised end-to-end in Task 11 (login) and Task 7 (middleware). Implementation follows the documented `@supabase/ssr` App Router pattern.

- [ ] **Step 1: Browser client**

```ts
// apps/dashboard/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Server client (Route Handlers, Server Components, Server Actions)**

```ts
// apps/dashboard/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In a Server Component this throws (cookies are read-only there);
          // middleware (Task 7) is what actually persists refreshed sessions.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op: called from a context where cookies can't be set
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Confirm it compiles**

Run: `npm run typecheck --workspace apps/dashboard`
Expected: no new errors (some may pre-exist from missing `.next/types`; resolve only newly introduced ones).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/lib/supabase
git commit -m "feat(dashboard): add Supabase browser and server client helpers"
```

---

## Task 7: Middleware — session refresh + login redirect (UX layer)

**Files:**
- Create: `apps/dashboard/middleware.ts`

- [ ] **Step 1: Implement middleware**

```ts
// apps/dashboard/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  // UX-only redirect. The real authorization gate is the session check inside
  // each Route Handler (Tasks 9-10) plus Postgres RLS -- not this redirect.
  if (!data.user && !isPublicPath && !request.nextUrl.pathname.startsWith("/api")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/middleware.ts
git commit -m "feat(dashboard): add session-refresh middleware with login redirect"
```

---

## Task 8: Login page

**Files:**
- Create: `apps/dashboard/app/login/actions.ts`
- Create: `apps/dashboard/app/login/page.tsx`

- [ ] **Step 1: Server action for sign-in**

```ts
// apps/dashboard/app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export async function signIn(formData: FormData): Promise<{ error: string } | never> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect("/zones");
}
```

- [ ] **Step 2: Login page**

```tsx
// apps/dashboard/app/login/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await signIn(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form action={handleSubmit} className="flex w-80 flex-col gap-4">
        <h1 className="text-2xl font-light tracking-wide">Operator sign in</h1>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded border px-3 py-2"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run:
```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npm run dev:dashboard
```
Open `http://localhost:3000/zones` in a browser → expect redirect to `/login`. Sign in with `demo-operator@hush.local` / `DemoOperator123!` (set in Task 2) → expect redirect to `/zones` (page doesn't exist yet until Task 12; a 404 there is fine for now, confirms the redirect and auth worked).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/login
git commit -m "feat(dashboard): add operator login page"
```

---

## Task 9: Zone API route handlers

**Files:**
- Create: `apps/dashboard/app/api/zones/route.ts`
- Create: `apps/dashboard/app/api/zones/[id]/route.ts`
- Test: `apps/dashboard/tests/api/zones.test.ts`

These tests mock `lib/supabase/server.ts` so they exercise only the route handler's own logic (auth check → validation → rate limit → delegated Supabase call). The actual IDOR enforcement is Postgres RLS, already covered by `supabase/tests/database/003_zones_rls.sql` — these tests verify the route handler *calls into* a session-scoped client correctly, not that RLS itself works.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/dashboard/tests/api/zones.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { POST } from "../../app/api/zones/route";
import { PATCH, DELETE } from "../../app/api/zones/[id]/route";

const validPayload = {
  name: "Demo Cafe",
  geofence: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  silenceContract: { suggested_minutes: 45 },
  rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/zones", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ single: () => Promise.resolve({ data: { id: "zone-1" }, error: null }) });
  mockEq.mockReturnValue({ select: mockSelect, single: () => Promise.resolve({ data: {}, error: null }) });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, delete: mockDelete });
});

describe("POST /api/zones", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({ name: "" }));
    expect(response.status).toBe(400);
  });

  it("inserts the zone using the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(201);
    expect(mockFrom).toHaveBeenCalledWith("zones");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ operator_id: "user-1", name: "Demo Cafe" })
    );
  });

  it("returns 429 once the per-user rate limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "rate-limit-user" } } });
    let lastResponse;
    for (let i = 0; i < 21; i++) {
      lastResponse = await POST(jsonRequest(validPayload));
    }
    expect(lastResponse!.status).toBe(429);
  });
});

describe("PATCH /api/zones/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/zones/zone-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(401);
  });

  it("updates via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/zones/zone-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
    expect(mockEq).toHaveBeenCalledWith("id", "zone-1");
  });
});

describe("DELETE /api/zones/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/zones/zone-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(401);
  });

  it("deletes via the session-scoped client when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/zones/zone-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(204);
    expect(mockEq).toHaveBeenCalledWith("id", "zone-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace apps/dashboard`
Expected: FAIL — `app/api/zones/route.ts` doesn't exist.

- [ ] **Step 3: Implement `app/api/zones/route.ts`**

```ts
// apps/dashboard/app/api/zones/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { zoneCreateSchema } from "../../../lib/validation/zone";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "zones:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = zoneCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("zones")
    .insert({
      operator_id: userData.user.id,
      name: parsed.data.name,
      geofence: parsed.data.geofence,
      silence_contract: parsed.data.silenceContract,
      reward_config: parsed.data.rewardConfig,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Implement `app/api/zones/[id]/route.ts`**

```ts
// apps/dashboard/app/api/zones/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { zoneUpdateSchema } from "../../../../lib/validation/zone";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "zones:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = zoneUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.geofence !== undefined) update.geofence = parsed.data.geofence;
  if (parsed.data.silenceContract !== undefined) update.silence_contract = parsed.data.silenceContract;
  if (parsed.data.rewardConfig !== undefined) update.reward_config = parsed.data.rewardConfig;

  const { data, error } = await supabase.from("zones").update(update).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "zones:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { error } = await supabase.from("zones").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test --workspace apps/dashboard`
Expected: PASS, all `api/zones.test.ts` cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/zones apps/dashboard/tests/api/zones.test.ts
git commit -m "feat(dashboard): add zone API route handlers with auth, validation, rate limiting"
```

---

## Task 10: Reward API route handlers

**Files:**
- Create: `apps/dashboard/app/api/rewards/route.ts`
- Create: `apps/dashboard/app/api/rewards/[id]/route.ts`
- Test: `apps/dashboard/tests/api/rewards.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/dashboard/tests/api/rewards.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { POST } from "../../app/api/rewards/route";
import { PATCH, DELETE } from "../../app/api/rewards/[id]/route";

const validPayload = {
  zoneId: "00000000-0000-0000-0000-00000000000a",
  name: "Free coffee",
  pointsCost: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ single: () => Promise.resolve({ data: { id: "reward-1" }, error: null }) });
  mockEq.mockReturnValue({ select: mockSelect, single: () => Promise.resolve({ data: {}, error: null }) });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, delete: mockDelete });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/rewards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/rewards", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({ ...validPayload, pointsCost: 0 }));
    expect(response.status).toBe(400);
  });

  it("inserts the reward via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(201);
    expect(mockFrom).toHaveBeenCalledWith("rewards");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ zone_id: validPayload.zoneId, name: "Free coffee", points_cost: 50 })
    );
  });
});

describe("PATCH /api/rewards/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/rewards/reward-1", {
      method: "PATCH",
      body: JSON.stringify({ pointsCost: 75 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(401);
  });

  it("updates via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/rewards/reward-1", {
      method: "PATCH",
      body: JSON.stringify({ pointsCost: 75 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ points_cost: 75 }));
  });
});

describe("DELETE /api/rewards/[id]", () => {
  it("deletes via the session-scoped client when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/rewards/reward-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace apps/dashboard`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement `app/api/rewards/route.ts`**

```ts
// apps/dashboard/app/api/rewards/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { rewardCreateSchema } from "../../../lib/validation/reward";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "rewards:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = rewardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rewards")
    .insert({ zone_id: parsed.data.zoneId, name: parsed.data.name, points_cost: parsed.data.pointsCost })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Implement `app/api/rewards/[id]/route.ts`**

```ts
// apps/dashboard/app/api/rewards/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { rewardUpdateSchema } from "../../../../lib/validation/reward";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "rewards:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = rewardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.pointsCost !== undefined) update.points_cost = parsed.data.pointsCost;

  const { data, error } = await supabase.from("rewards").update(update).eq("id", id).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "rewards:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { error } = await supabase.from("rewards").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test --workspace apps/dashboard`
Expected: PASS, all `api/rewards.test.ts` cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/rewards apps/dashboard/tests/api/rewards.test.ts
git commit -m "feat(dashboard): add reward API route handlers with auth, validation, rate limiting"
```

---

## Task 11: Mapbox token wiring

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the new env var**

```
# ---- Next.js dashboard (only NEXT_PUBLIC_* reach the browser bundle) ----
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Mapbox GL token for the zone-drawing map (Phase 2). Get a free token at
# https://account.mapbox.com/access-tokens/ -- this is a public/client token
# by design (Mapbox tokens are scoped and domain-restrictable, unlike the
# Supabase service-role key, which must never appear here).
NEXT_PUBLIC_MAPBOX_TOKEN=
```

- [ ] **Step 2: Add the same line to local `.env`**

Manually add `NEXT_PUBLIC_MAPBOX_TOKEN=<your token>` to `.env` (git-ignored, not committed). If you don't have a Mapbox token yet, leave it blank — `ZoneMapEditor` (Task 12) still renders the editor controls; only basemap tiles fail to load, which doesn't block drawing/saving polygon coordinates.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document NEXT_PUBLIC_MAPBOX_TOKEN for the zone map editor"
```

---

## Task 12: Zone map editor component

**Files:**
- Create: `apps/dashboard/components/ZoneMapEditor.tsx`

This wraps `mapbox-gl` + `@mapbox/mapbox-gl-draw`, both of which require a real DOM/WebGL context — not meaningfully unit-testable in `jsdom`. Its only logic (closing/validating the drawn ring) is already covered by `lib/geo.ts` tests (Task 3); this task is verified manually (Task 14).

- [ ] **Step 1: Implement the component**

```tsx
// apps/dashboard/components/ZoneMapEditor.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { closeRing, validatePolygonRing, type Point } from "../lib/geo";
import type { GeoJsonPolygon } from "@hush/shared-types";

interface ZoneMapEditorProps {
  initialPolygon?: GeoJsonPolygon;
  onChange: (polygon: GeoJsonPolygon | null, error: string | null) => void;
}

export function ZoneMapEditor({ initialPolygon, onChange }: ZoneMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: initialPolygon?.coordinates[0]?.[0] ?? [121.05, 14.55],
      zoom: 16,
    });
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    map.addControl(draw);

    function handleDrawChange() {
      const features = draw.getAll().features;
      const feature = features[0];
      if (!feature || feature.geometry.type !== "Polygon") {
        onChange(null, null);
        return;
      }
      const ring = closeRing(feature.geometry.coordinates[0] as Point[]);
      const result = validatePolygonRing(ring);
      if (!result.ok) {
        onChange(null, result.reason);
        return;
      }
      onChange({ type: "Polygon", coordinates: [ring] }, null);
    }

    map.on("draw.create", handleDrawChange);
    map.on("draw.update", handleDrawChange);
    map.on("draw.delete", handleDrawChange);

    if (initialPolygon) {
      map.on("load", () => {
        draw.add({ type: "Feature", properties: {}, geometry: initialPolygon });
      });
    }

    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "400px" }} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/components/ZoneMapEditor.tsx
git commit -m "feat(dashboard): add Mapbox GL Draw zone map editor component"
```

---

## Task 13: Zone/reward forms and dashboard pages

**Files:**
- Create: `apps/dashboard/components/ZoneForm.tsx`
- Create: `apps/dashboard/components/RewardForm.tsx`
- Create: `apps/dashboard/app/(dashboard)/layout.tsx`
- Create: `apps/dashboard/app/(dashboard)/zones/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/zones/new/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/zones/[id]/page.tsx`

- [ ] **Step 1: Dashboard layout (nav + sign-out)**

```tsx
// apps/dashboard/app/(dashboard)/layout.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/zones" className="font-light tracking-wide">
          Hush — Operator Console
        </Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Zone form (shared by create/edit)**

```tsx
// apps/dashboard/components/ZoneForm.tsx
"use client";

import { useState } from "react";
import type { GeoJsonPolygon, RewardConfig, SilenceContract } from "@hush/shared-types";
import { ZoneMapEditor } from "./ZoneMapEditor";

export interface ZoneFormValues {
  name: string;
  geofence: GeoJsonPolygon | null;
  silenceContract: SilenceContract;
  rewardConfig: RewardConfig;
}

interface ZoneFormProps {
  initialValues?: Partial<ZoneFormValues>;
  onSubmit: (values: ZoneFormValues) => Promise<void>;
  submitLabel: string;
}

export function ZoneForm({ initialValues, onSubmit, submitLabel }: ZoneFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [geofence, setGeofence] = useState<GeoJsonPolygon | null>(initialValues?.geofence ?? null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [suggestedMinutes, setSuggestedMinutes] = useState(
    initialValues?.silenceContract?.suggested_minutes ?? 45
  );
  const [earnRate, setEarnRate] = useState(initialValues?.rewardConfig?.earn_rate_per_quiet_minute ?? 1);
  const [minScore, setMinScore] = useState(initialValues?.rewardConfig?.min_score_for_earning ?? 70);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!geofence) {
      setSubmitError("Draw a zone boundary on the map before saving.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        name,
        geofence,
        silenceContract: { suggested_minutes: suggestedMinutes },
        rewardConfig: { earn_rate_per_quiet_minute: earnRate, min_score_for_earning: minScore },
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save zone.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Zone name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="rounded border px-3 py-2"
        />
      </label>

      <ZoneMapEditor
        initialPolygon={initialValues?.geofence}
        onChange={(polygon, error) => {
          setGeofence(polygon);
          setMapError(error);
        }}
      />
      {mapError ? <p className="text-sm text-red-600">{mapError}</p> : null}

      <label className="flex flex-col gap-1">
        Suggested silence minutes
        <input
          type="number"
          value={suggestedMinutes}
          onChange={(event) => setSuggestedMinutes(Number(event.target.value))}
          min={1}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Earn rate (points per quiet minute)
        <input
          type="number"
          value={earnRate}
          onChange={(event) => setEarnRate(Number(event.target.value))}
          min={0}
          step="0.1"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Minimum score to earn (0-100)
        <input
          type="number"
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          min={0}
          max={100}
          className="rounded border px-3 py-2"
        />
      </label>

      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
      <button type="submit" disabled={submitting} className="rounded bg-black px-3 py-2 text-white">
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Reward form**

```tsx
// apps/dashboard/components/RewardForm.tsx
"use client";

import { useState } from "react";

interface RewardFormProps {
  onSubmit: (values: { name: string; pointsCost: number }) => Promise<void>;
}

export function RewardForm({ onSubmit }: RewardFormProps) {
  const [name, setName] = useState("");
  const [pointsCost, setPointsCost] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name, pointsCost });
      setName("");
      setPointsCost(50);
    } catch (submitErr) {
      setError(submitErr instanceof Error ? submitErr.message : "Failed to save reward.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <label className="flex flex-col gap-1">
        Reward name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Point cost
        <input
          type="number"
          value={pointsCost}
          onChange={(event) => setPointsCost(Number(event.target.value))}
          min={1}
          className="rounded border px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={submitting} className="rounded bg-black px-3 py-2 text-white">
        {submitting ? "Adding…" : "Add reward"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Zone list page**

```tsx
// apps/dashboard/app/(dashboard)/zones/page.tsx
import Link from "next/link";
import { createClient } from "../../../lib/supabase/server";

export default async function ZonesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, created_at")
    .eq("operator_id", userData.user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Your zones</h1>
        <Link href="/zones/new" className="rounded bg-black px-3 py-2 text-white">
          New zone
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {(zones ?? []).map((zone) => (
          <li key={zone.id}>
            <Link href={`/zones/${zone.id}`} className="underline">
              {zone.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: New zone page**

```tsx
// apps/dashboard/app/(dashboard)/zones/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";

export default function NewZonePage() {
  const router = useRouter();

  async function handleSubmit(values: ZoneFormValues) {
    const response = await fetch("/api/zones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        geofence: values.geofence,
        silenceContract: values.silenceContract,
        rewardConfig: values.rewardConfig,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to create zone.");
    }
    const zone = await response.json();
    router.push(`/zones/${zone.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-light tracking-wide">New zone</h1>
      <ZoneForm onSubmit={handleSubmit} submitLabel="Create zone" />
    </div>
  );
}
```

- [ ] **Step 6: Zone detail/edit page with reward management**

```tsx
// apps/dashboard/app/(dashboard)/zones/[id]/page.tsx
import { createClient } from "../../../../lib/supabase/server";
import { ZoneEditClient } from "./zone-edit-client";

export default async function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zone } = await supabase.from("zones").select("*").eq("id", id).single();
  const { data: rewards } = await supabase.from("rewards").select("*").eq("zone_id", id);

  if (!zone) {
    return <p>Zone not found.</p>;
  }

  return <ZoneEditClient zone={zone} rewards={rewards ?? []} />;
}
```

```tsx
// apps/dashboard/app/(dashboard)/zones/[id]/zone-edit-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";
import { RewardForm } from "../../../../components/RewardForm";
import type { Reward, Zone } from "@hush/shared-types";

interface ZoneEditClientProps {
  zone: Zone;
  rewards: Reward[];
}

export function ZoneEditClient({ zone, rewards: initialRewards }: ZoneEditClientProps) {
  const router = useRouter();
  const [rewards, setRewards] = useState(initialRewards);

  async function handleZoneSubmit(values: ZoneFormValues) {
    const response = await fetch(`/api/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        geofence: values.geofence,
        silenceContract: values.silenceContract,
        rewardConfig: values.rewardConfig,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to update zone.");
    }
    router.refresh();
  }

  async function handleRewardSubmit(values: { name: string; pointsCost: number }) {
    const response = await fetch("/api/rewards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zoneId: zone.id, name: values.name, pointsCost: values.pointsCost }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to add reward.");
    }
    const reward = await response.json();
    setRewards((current) => [...current, reward]);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-light tracking-wide">{zone.name}</h1>
      <ZoneForm
        initialValues={{
          name: zone.name,
          geofence: zone.geofence,
          silenceContract: zone.silenceContract,
          rewardConfig: zone.rewardConfig,
        }}
        onSubmit={handleZoneSubmit}
        submitLabel="Save changes"
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-light tracking-wide">Rewards</h2>
        <ul className="flex flex-col gap-1">
          {rewards.map((reward) => (
            <li key={reward.id}>
              {reward.name} — {reward.pointsCost} points
            </li>
          ))}
        </ul>
        <RewardForm onSubmit={handleRewardSubmit} />
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Run typecheck and tests**

Run:
```bash
npm run typecheck --workspace apps/dashboard
npm run test --workspace apps/dashboard
```
Expected: no new type errors; all prior tests still pass (these pages have no new unit tests — they're exercised manually in Task 14).

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/components apps/dashboard/app/\(dashboard\)
git commit -m "feat(dashboard): add zone list/create/edit pages and reward management UI"
```

---

## Task 14: End-to-end manual verification (the deliverable demo)

**Files:** none — manual browser verification only.

- [ ] **Step 1: Reset the DB to the latest seed and start both servers**

```bash
cd "c:\Users\Username\Downloads\PERSONAL PROJECTS\OGIS"
npx supabase db reset
npm run dev:dashboard
```

- [ ] **Step 2: Walk the golden path**

In a browser:
1. Visit `http://localhost:3000/zones` → redirected to `/login`.
2. Sign in as `demo-operator@hush.local` / `DemoOperator123!` → redirected to `/zones`, showing the seeded "Demo Cafe" zone.
3. Click "New zone" → draw a polygon on the map (or, if no Mapbox token is configured, confirm the draw controls still render even though tiles are blank) → name it "Demo Café 2" → set silence minutes/reward fields → submit → redirected to the new zone's detail page.
4. Reload the detail page → confirm the zone's name, polygon, and reward-config fields persisted.
5. Add a reward ("Free pastry", 30 points) on the detail page → confirm it appears in the rewards list without a page reload.
6. Edit the zone's name → save → reload → confirm the new name persisted.

- [ ] **Step 3: Confirm the IDOR guard holds for the dashboard, not just pgTAP**

Open a private/incognito browser window, sign up a second operator account at `/login` (Supabase `enable_signup = true` locally) — note: there's no self-serve signup form yet, so instead run this directly against the API to prove enforcement:
```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $(npx supabase status -o env | grep ANON_KEY | cut -d'"' -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email":"operator-b@hush.local","password":"OperatorB123!"}'
```
Then sign in as `operator-b@hush.local` in the second browser window and attempt to visit `/zones/00000000-0000-0000-0000-00000000000a` (the demo zone) and submit an edit. Expected: the page loads (zones are publicly readable for discovery, by design) but the PATCH returns the row unmodified / the UI shows no change after reload, because the Postgres RLS `zones_update_own` policy filters operator B's update to zero rows — the same guarantee already proven in `supabase/tests/database/003_zones_rls.sql`.

- [ ] **Step 4: Run the full test suite one more time**

```bash
npm run test --workspace apps/dashboard
npm run typecheck
npx supabase test db
```
Expected: all green.

- [ ] **Step 5: Commit any fixes found during manual verification, then record phase completion**

If Step 2 or 3 surfaces a bug, fix it with its own focused commit (test-first if the bug is in `lib/`). Once the golden path and IDOR check both hold, this phase is done per `CLAUDE.md`'s definition: tests pass, committed, and visibly demoable.

---

## Self-review notes

- **Spec coverage:** operator login (Tasks 2, 8) · map polygon draw + persist (Tasks 3, 12, 13) · vertex cap + server-side coordinate validation (Tasks 3, 5, 9) · zone CRUD scoped by RLS (Tasks 9, reusing Phase 1's `003_zones_rls.sql`) · reward management (Tasks 5, 10, 13) · rate-limited write endpoints (Tasks 4, 9, 10) · "not just hiding UI" authorization (Task 7 explicitly notes the redirect is UX, Tasks 9-10 re-check session server-side) · exit criteria's "another operator cannot see/edit this zone (tested)" (Task 14 Step 3, building on Task 1's existing pgTAP coverage).
- **Security gates:** SR-1 (Task 4/9/10), SR-3 (Task 7's explicit UX-vs-authorization split), SR-4 (Task 5's strict zod schemas + Task 3's vertex cap), SR-7/SR-8 (session-scoped Supabase client in every route handler, never service-role — Task 6/9/10).
