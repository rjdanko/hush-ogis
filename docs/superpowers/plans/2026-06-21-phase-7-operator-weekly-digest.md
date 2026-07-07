# Phase 7 — AI: Operator Weekly Digest (B5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan touches the Claude API — keep the `claude-api` skill open while implementing.

## Context

Phase 7 turns anonymized, aggregated zone metrics into a plain-English weekly digest with suggestions, rendered in the operator dashboard. It is the first phase to actually call the Claude API, and the first to give the FastAPI `ai-service` real work — today it's a bare `/health` stub ([apps/ai-service/app/main.py](../../../apps/ai-service/app/main.py)).

The reason this is worth building: operators have no narrative read on their zone. The data already exists from Phases 5–6 (`quiet_index` time-series, `wallet_ledger` accrual, `redemptions`, `sessions`/`score_pings`), but it's raw. Phase 7 produces a calm, demoable "Generate weekly digest" button on the zone page that yields a Claude-written summary + suggestion cards.

**Hard privacy/security boundary (PRD §7.3, §11):** only **aggregated, anonymized** metrics may leave the DB boundary and reach the LLM — never per-user wallet balances, score histories, or session-level rows. The Claude key lives **only** in the service env (SR-2). The endpoint is operator-JWT-scoped (SR-3/SR-7), Pydantic-validated (SR-4), rate-limited (SR-1), and leaks no stack traces/keys on failure (SR-15).

**Decisions locked for this phase (confirmed with user):**
- Aggregation lives in a **Postgres `SECURITY DEFINER` function** (`zone_weekly_metrics`), pgTAP-tested, anonymization enforced at the DB boundary — matching the existing `accrue_session_points` / `redeem_reward` convention.
- FastAPI **verifies the operator JWT locally** (HS256 via `SUPABASE_JWT_SECRET`), extracts `sub`, and scopes the aggregation to that operator.
- Dashboard shows a **per-zone digest panel** on the existing zone detail page, **generated fresh** on each click (no persistence).

**Out of scope (documented gaps, deferred):** digest persistence/history (Phase 9 analytics may revisit), streaming the Claude response, and the certification badge (Phase 9, O4).

---

## Architecture & data flow

```
Dashboard zone page (client)
  └─ POST /api/digest  (Next.js route handler; reuses operator cookie session + in-memory rate-limit)
       └─ forwards Bearer <supabase access_token> to:
            POST {AI_SERVICE_URL}/zones/{zone_id}/digest   (FastAPI)
               1. rate-limit (SR-1)            ← before any DB/LLM work
               2. verify JWT locally (SR-3)     ← SUPABASE_JWT_SECRET, extract sub=operator_id
               3. validate path/body (SR-4)     ← Pydantic
               4. call SECURITY DEFINER RPC zone_weekly_metrics(zone_id, operator_id)
                  · returns aggregated JSON; raises if zone not owned by operator (SR-7)
                  · NO per-user rows ever selected
               5. call Claude (haiku default / opus for demo) with structured-output schema
               6. return {summary, suggestions[]}  ← generic 4xx/5xx on any failure (SR-15)
```

Both proxy (Next.js) and origin (FastAPI) enforce auth + rate-limit; FastAPI never trusts the proxy (the SR gates must hold at the real service boundary).

---

### Task 1: `zone_weekly_metrics` aggregation function (DB, pgTAP)

**Files:**
- Create: `supabase/migrations/0023_zone_weekly_metrics.sql`
- Create: `supabase/tests/database/015_zone_weekly_metrics.sql`

A `SECURITY DEFINER` function `public.zone_weekly_metrics(p_zone_id uuid, p_operator_id uuid) returns jsonb`. It is the **only** thing trusted to read across users, so anonymization is enforced here, not in Python.

- [ ] **Step 1 (RED):** Write the pgTAP test first. Seed one operator + zone, a second operator + zone, plus `quiet_index` rows, checked-out `sessions` with `score_pings`, `wallet_ledger` `quiet_minute_accrual` rows, and `redemptions` across the last 7 days. Assert:
  - returns a `jsonb` object with keys: `zone_name`, `window_days`, `quiet_index_trend` (array of `{day, avg_value, avg_active_count}`), `check_in_count`, `total_quiet_minutes`, `total_points_accrued`, `redemption_count`, `peak_window` (`{hour_of_day, max_active_count}`).
  - **negative/IDOR test (SR-7):** calling with `(zoneA, operatorB)` raises (e.g. `raise exception 'not_authorized'`) — an operator cannot summarize a zone they don't own. This is the required negative test.
  - **anonymity:** no `user_id` appears anywhere in the returned JSON (assert via `jsonb` text not containing a seeded user UUID).
- [ ] **Step 2 (GREEN):** Implement. Guard first: `select 1 from zones where id = p_zone_id and operator_id = p_operator_id` → if not found, `raise exception 'not_authorized'`. Then aggregate over `now() - interval '7 days'`:
  - trend: `date_trunc('day', ts)` group over `quiet_index` for the zone → avg value, avg active_count.
  - `check_in_count`: `count(*)` of `sessions` for the zone in window.
  - `total_quiet_minutes`: reuse the gap-capped logic shape from `compute_eligible_quiet_minutes` (`0019`) — sum capped 60s gaps between consecutive `score_pings` joined through `sessions` for the zone (read the zone's `reward_config->>'min_score_for_earning'`, default 70).
  - `total_points_accrued`: `sum(delta)` from `wallet_ledger` where `reason='quiet_minute_accrual'` and `metadata->>'zone_id' = p_zone_id::text` in window.
  - `redemption_count`: `count(*)` from `redemptions` for the zone in window.
  - `peak_window`: hour-of-day with max active_count from `quiet_index`.
  Build the result with `jsonb_build_object` / `jsonb_agg`. `set search_path = public`. **Revoke** execute from `public`/`anon`/`authenticated`; the service calls it via service-role (which bypasses the grant), so no broad grant is needed — verify the service-role path in Task 6's e2e check.
- [ ] **Step 3:** Run `supabase test db` (or the project's pgTAP runner) — all assertions green.

> Reference: `supabase/migrations/0019_session_points_accrual.sql` (gap-capped quiet-minute math), `0017_quiet_index_engine.sql` (quiet_index shape), `0021_redemptions.sql`. RLS-test gotchas: memory `phase-1-rls-testing-gotchas` (use `throws_ok` for the negative case; `reset role` doesn't clear JWT claims — seed as `postgres`).

---

### Task 2: ai-service settings, deps & Supabase/Claude clients

**Files:**
- Edit: `apps/ai-service/pyproject.toml` (add deps)
- Create: `apps/ai-service/app/settings.py`
- Create: `apps/ai-service/app/supabase_client.py`
- Create: `apps/ai-service/tests/test_settings.py`
- Edit: `.env.example` (add `SUPABASE_JWT_SECRET`; `AI_SERVICE_URL` for dashboard)

- [ ] Add to `pyproject.toml`: `anthropic`, `supabase` (or `httpx`-based PostgREST call), `pyjwt[crypto]`, `pydantic-settings`. Keep `pytest`/`httpx` in dev.
- [ ] `settings.py`: a `pydantic-settings` `BaseSettings` loading `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, and `DIGEST_MODEL` (default `claude-haiku-4-5`; demo override `claude-opus-4-8`). **Test (RED→GREEN):** missing required var fails fast at construction; defaults resolve.
- [ ] `supabase_client.py`: a thin helper that calls the RPC `zone_weekly_metrics` with the **service-role key** (server-only, SR-2). Single source of the service-role client so the key never spreads.
- [ ] `.env.example`: document `SUPABASE_JWT_SECRET=` (server-only) under the AI-service block, and `AI_SERVICE_URL=http://localhost:8000` under a dashboard block. Confirm the Claude key comment already forbids client bundling (it does).

> Note: `claude-haiku-4-5` supports structured outputs but **not** `effort`/adaptive thinking — do not pass those params for haiku (they 400). `claude-opus-4-8` may add `thinking={"type":"adaptive"}` but it's unnecessary for this digest; keep the call identical across models except the model id.

---

### Task 3: JWT verification + rate-limit + error hygiene (FastAPI plumbing)

**Files:**
- Create: `apps/ai-service/app/auth.py`
- Create: `apps/ai-service/app/rate_limit.py`
- Create: `apps/ai-service/tests/test_auth.py`, `apps/ai-service/tests/test_rate_limit.py`

- [ ] `auth.py` — a FastAPI dependency that reads `Authorization: Bearer <jwt>`, verifies locally with `jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")`, and returns `operator_id = claims["sub"]`. **Tests (RED→GREEN):** valid token → operator id; missing/garbage/expired/wrong-signature token → `401` with a generic body (no decode internals). Mirror the dashboard's auth posture (`apps/dashboard/lib/supabase/server.ts`).
- [ ] `rate_limit.py` — a small in-memory fixed-window limiter keyed by `operator_id` (port the approach in `apps/dashboard/lib/rate-limit.ts` so behavior matches). **Test:** N within window pass, N+1 → `429`. Applied **before** DB/LLM (SR-1).
- [ ] Add a global exception handler so unhandled errors return a generic `{"error":"internal_error"}` `500` and never a stack trace or key (SR-15). **Test:** a route that raises returns `500` with the generic body.

---

### Task 4: Claude digest generation (structured output)

**Files:**
- Create: `apps/ai-service/app/digest.py` (prompt + Claude call + schema)
- Create: `apps/ai-service/app/models.py` (Pydantic request/response DTOs)
- Create: `apps/ai-service/tests/test_digest.py`

- [ ] `models.py`: `DigestResponse` = `{ summary: str, suggestions: list[Suggestion] }`, `Suggestion = { title: str, body: str }`. These double as the JSON-Schema for structured output.
- [ ] `digest.py`: build a system+user prompt from the aggregated metrics dict (Task 1's JSON), instruct calm/non-anxious tone per Design Brief (no hype, no engagement-bait), and call `client.messages.parse(model=settings.DIGEST_MODEL, max_tokens=2048, output_config={"format": {...DigestResponse schema...}}, messages=[...])`. Return the parsed `DigestResponse`.
  - Honor JSON-Schema limits from the `claude-api` skill: object types need `additionalProperties: false` + `required`; avoid unsupported constraints (`minLength`, `maxItems`, etc.).
- [ ] **Test (mocked Claude):** patch the Anthropic client; assert the prompt the digest builder produces contains the aggregated numbers and **does not** contain any user identifier; assert a mocked structured response maps cleanly to `DigestResponse`. (Real Claude is exercised in Task 6's manual/e2e check, not in unit tests.)

---

### Task 5: Wire the endpoint + Next.js proxy + dashboard panel

**Files:**
- Create: `apps/ai-service/app/routes_digest.py`; Edit: `apps/ai-service/app/main.py` (include router, register exception handler)
- Create: `apps/ai-service/tests/test_digest_endpoint.py`
- Create: `apps/dashboard/app/api/digest/route.ts`
- Create: `apps/dashboard/components/DigestPanel.tsx`; Edit: `apps/dashboard/app/(dashboard)/zones/[id]/zone-edit-client.tsx` (mount the panel)
- Create: `apps/dashboard/tests/api/digest.test.ts`

- [ ] **FastAPI route** `POST /zones/{zone_id}/digest`: deps = `rate_limit` → `auth` (operator_id) → validate `zone_id` (uuid) → `zone_weekly_metrics(zone_id, operator_id)` via service-role → `digest.generate(metrics)` → return `DigestResponse`. Map the DB `not_authorized` exception to a generic `403`/`404` (don't reveal whether the zone exists). **Endpoint test (mocked Supabase + Claude):** `200` happy path; `401` no token; `429` over limit; `403/404` on non-owned zone; generic `500` on downstream failure.
- [ ] **Next.js route** `app/api/digest/route.ts`: follow the existing `app/api/zones/route.ts` shape — `supabase.auth.getUser()` (401 if none), `checkRateLimit(userId, "digest:generate", …)`, then `supabase.auth.getSession()` → `access_token`, `fetch(`${process.env.AI_SERVICE_URL}/zones/${zoneId}/digest`, { Authorization: Bearer })`, relay JSON; on non-OK return a generic error. **Test:** mirror `tests/api/zones.test.ts` (401, 429, 200-relay).
- [ ] **DigestPanel.tsx** (client): a "Generate weekly digest" button + render area following the calm card style in `components/LiveQuietIndex.tsx` (`rounded border border-neutral-200 p-4`, `font-light`, generous spacing — no spinners-as-anxiety; a quiet "Generating…" label is fine). Renders `summary` as prose + each `suggestion` as a soft card. Mount it in `zone-edit-client.tsx` so it appears on the zone detail page for the owning operator.

---

### Task 6: Security gates, audit & e2e verification

- [ ] `pip-audit` in `apps/ai-service` and `npm audit` in `apps/dashboard` (SR-14); note any deferred highs consistent with memory `phase-0-tooling-substitutions`.
- [ ] **Privacy assertion:** add/confirm a test that the metrics payload sent to Claude contains no `user_id`, and that `zone_weekly_metrics` output is user-free (Task 1 covers the DB side; Task 4 covers the prompt side).
- [ ] **Real e2e against the local stack** (per memory `hush-phase-workflow-preferences` — a real run, not just mocks): start Supabase + the FastAPI service + the dashboard; sign in as the seeded demo operator; click "Generate weekly digest" on the demo zone; confirm a Claude-written summary + suggestion cards appear, populated from real aggregated data (quiet-minute earning + redemptions reflected). Verify with `ANTHROPIC_API_KEY` set only in the service env. A Playwright check that drives the button and asserts the panel renders text is the bar for "done".
- [ ] Confirm SR gates: SR-1 (429 proven), SR-2 (key only in service env; grep client bundles for it = absent), SR-3/SR-7 (JWT scope + IDOR negative test green), SR-4 (Pydantic/uuid validation), SR-15 (generic errors, no stack traces).

---

## Verification summary

- **Unit/DB:** `supabase test db` (Task 1 pgTAP incl. IDOR negative + anonymity), `pytest` in `apps/ai-service` (settings, auth, rate-limit, digest builder, endpoint), `vitest` in `apps/dashboard` (digest API route).
- **Integration/e2e:** local stack run + Playwright click-through generating a real Claude digest for the demo zone (Task 6).
- **Phase is done when:** all tests pass, the e2e digest renders from aggregated-only data, the SR-1/2/3/4/7/15 gates hold, audits are run, and the work is committed directly to `master` (per memory `hush-phase-workflow-preferences`).
