# Hush — Implementation Plan (Phased)

> **For agentic workers:** This is a **phased master plan**. Each phase is a self-contained, demoable module. **Do not try to execute the whole document at once.** When you start a phase, expand it into a detailed task-by-task TDD plan (REQUIRED SUB-SKILL: `superpowers:writing-plans` for the phase, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` to build it). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Hush — a 100% software platform that turns physical spaces into measurable, rewarded zones of intentional digital silence — as a demoable hackathon MVP, structured so each piece can be built and supervised independently.

**Architecture:** A monorepo with three deployable apps over one backend: (1) **React Native + Expo** mobile app (Android-first), (2) **Next.js** operator dashboard, (3) **FastAPI** AI service — all on **Supabase** (Postgres + PostGIS + Auth + Realtime). Security is enforced server-side via Row-Level Security, Pydantic/zod validation, and rate limiting from Phase 1 onward, not bolted on at the end.

**Tech Stack:** React Native/Expo (custom dev client) · TypeScript · Next.js + Tailwind + Recharts · FastAPI (Python) + Pydantic + SQLAlchemy · Supabase (Postgres/PostGIS/Auth/Realtime) · Claude API · Mapbox or react-native-maps.

**Companion docs:** `Hush-PRD.md` (requirements, feature IDs U*/B*/O*/SR*), `Hush-Design-Brief.md` (visual direction).

---

## How to use this plan

- **Phases are the unit of supervision.** Each has: *Goal · Modules · Key tasks · Deliverable/demo · Exit criteria · Security gates · Depends on.*
- **Phases 0–8 are the MVP path.** Phases 9–10 are polish/hardening. Phase IDs in 🟢/🔵 match the PRD tags.
- **One phase = one expansion.** Before building phase N, generate its detailed TDD plan. This keeps each working document small enough to hold in context and easy for you to review between tasks.
- **Every phase ends green:** its tests pass, it is committed, and (from Phase 2 on) something is visibly demoable.
- **Security gates are mandatory.** A phase is not "done" until its listed `SR-*` checks pass. Never defer them to Phase 10.

---

## Monorepo / file structure (locked in Phase 0)

```
hush/
├─ apps/
│  ├─ mobile/            # React Native + Expo (user app)
│  ├─ dashboard/         # Next.js (operator console)
│  └─ ai-service/        # FastAPI (Claude orchestration, Quiet Index helpers)
├─ packages/
│  ├─ shared-types/      # TS types shared by mobile + dashboard (zone, session, score…)
│  └─ config/            # shared lint/tsconfig/env schema
├─ supabase/
│  ├─ migrations/        # SQL migrations (schema + RLS policies)
│  └─ seed/              # demo zone + operator seed for testing
├─ .env.example          # documents every required var; real .env is git-ignored (SR-2)
└─ README.md
```

**Boundary principle:** split by responsibility, not layer. Shared contracts live in `packages/shared-types` so the app, dashboard, and service can never drift on what a `Session` or `ScorePing` looks like.

---

## Dependency graph (build order)

```
Phase 0  Foundation
   └─► Phase 1  Data + Auth + Security baseline
          ├─► Phase 2  Operator console: zone setup        (seeds data for the app)
          │      └─► Phase 9  Operator analytics + badge
          └─► Phase 3  Mobile core: map + zone + check-in
                 ├─► Phase 4  On-device silence agent
                 │      └─► Phase 5  Quiet Index engine + realtime
                 │             ├─► Phase 6  Rewards + wallet + summary
                 │             └─► Phase 7  AI operator weekly digest
                 └─► Phase 8  Personal disconnection coach (on-device)
                              ↓
                       Phase 10  Security hardening + polish + demo
```

---

## Phase 0 — Foundation & Scaffolding 🟢

**Goal:** A running monorepo where all three apps boot and the Supabase project exists, with secrets handled correctly from line one.

**Modules:** monorepo tooling · Expo app shell · Next.js shell · FastAPI shell · Supabase project · env/secret hygiene.

**Key tasks:**
- Init monorepo (pnpm/turbo or npm workspaces). Add `packages/shared-types`, `packages/config`.
- Scaffold `apps/mobile` (Expo, custom dev client, TypeScript) — boots to a blank screen on Android emulator/device.
- Scaffold `apps/dashboard` (Next.js + Tailwind) — boots to a placeholder page.
- Scaffold `apps/ai-service` (FastAPI + uv/poetry) — `GET /health` returns `{status:"ok"}` with a passing test.
- Create Supabase project; install Supabase CLI; wire local dev. Enable the **PostGIS** extension via migration.
- **Security baseline:** create `.env.example` listing every var; add `.env` to `.gitignore`; commit a `pip-audit`/`npm audit` script (SR-14); confirm **no service-role key** is referenced from any client app (SR-2).

**Deliverable/demo:** `pnpm dev` (or equivalent) brings up all three apps; FastAPI health test is green.

**Exit criteria:** all three apps boot; health test passes; repo committed; `.env.example` complete; secrets git-ignored.

**Security gates:** SR-2 (no secrets in client / git), SR-14 (audit script present).

**Depends on:** —

---

## Phase 1 — Data Layer, Auth & Security Baseline 🟢

**Goal:** The full data model exists with Row-Level Security and roles, so every later phase inherits IDOR/authz protection for free.

**Modules:** schema migrations · RLS policies · auth (Supabase) · roles (`user`/`operator`/`admin`) · shared types.

**Key tasks:**
- Write migrations for the PRD §9.2 model: `users`, `operators`, `zones` (PostGIS polygon), `sessions`, `score_pings`, `quiet_index`, `rewards`, `wallet_ledger`. Use **UUID** primary keys (SR-7).
- Add a `role` claim / `operators` linkage; define `user`/`operator`/`admin`.
- Write **RLS policies** (SR-7/SR-8): users read/write only their own rows (`user_id = auth.uid()`); operators only rows for zones they own (`operator_id = auth.uid()`); deny-by-default on everything else. **Test each policy** with positive and negative cases (the negative test — "user B cannot read user A's session" — is the IDOR guard).
- Configure Supabase Auth (email/OTP or anon for demo); issue JWTs.
- Generate/author `packages/shared-types` from the schema so app/dashboard share one source of truth.
- Seed script (`supabase/seed`): one demo operator + one demo zone, for downstream testing.

**Deliverable/demo:** A test suite proving RLS — e.g. authenticated user A is denied access to user B's session row; operator X cannot edit operator Y's zone.

**Exit criteria:** migrations apply cleanly; RLS positive/negative tests green; seed creates a working demo zone; shared types compile.

**Security gates:** SR-6 (parameterized — Supabase client/SQLAlchemy only), SR-7 (RLS + UUIDs + negative tests), SR-8 (deny-by-default), SR-5 (HTTPS/WSS config).

**Depends on:** Phase 0.

---

## Phase 2 — Operator Console: Zone Setup (O1, O5) 🟢

**Goal:** An operator can sign in, draw a zone on a map, set a silence contract + reward, and persist it — giving the mobile app real data to consume.

**Modules:** operator auth UI · map zone editor · zone CRUD (RLS-guarded) · reward definition.

**Key tasks:**
- Operator login (Supabase Auth) in the dashboard; protected routes redirect when unauthenticated, but **authorization is verified server-side** (SR-3/SR-8), not just by hiding UI.
- Map component (Mapbox GL) with polygon draw → save zone boundary (PostGIS). **Cap polygon vertex count** and validate coordinates server-side (SR-4).
- Zone CRUD: create/edit/delete, scoped by RLS to the owning operator (SR-7).
- Reward management (O5): define reward name, point cost, silence threshold; validated with zod + server schema (SR-4).
- Rate-limit the zone/reward write endpoints (SR-1).

**Deliverable/demo:** Log in as the seeded operator → draw "Demo Café" zone → set "45 min / free coffee at 5 zone-hours" → it persists and is visible on reload.

**Exit criteria:** zone create/edit/delete works under RLS; validation rejects malformed polygons/inputs; another operator cannot see/edit this zone (tested).

**Security gates:** SR-1, SR-3, SR-4, SR-7, SR-8.

**Depends on:** Phase 1.

---

## Phase 3 — Mobile Core: Map, Zone Discovery & Check-in (U1, U2) 🟢

**Goal:** A user can open the app, see the seeded zone on a live map, and check in with a personal silence commitment.

**Modules:** mobile auth · zone map + glow · geofence/check-in · commitment setter · session lifecycle.

**Key tasks:**
- Mobile auth (Supabase, anon or email for demo).
- Map screen (U1): fetch nearby zones, render each as a glowing bloom sized/colored by current Quiet Index (static placeholder Index until Phase 5). Follow the Design Brief glow scale.
- Geofence detection: is the user inside the zone polygon? Use device location + PostGIS point-in-polygon (parameterized, SR-6). Provide a manual-confirm fallback for demo reliability (U2).
- Commitment setter (calm minutes dial) → creates a `sessions` row (start, committed_minutes).
- Check-out path closes the session (achieved_minutes placeholder until Phase 4).
- Rate-limit check-in endpoint (SR-1); a user can only create sessions for themselves (SR-7).

**Deliverable/demo:** Open app → see Demo Café glowing on the map → enter geofence (or confirm) → commit "20 min" → session is created and visible.

**Exit criteria:** map renders real seeded zone; check-in creates an RLS-scoped session; user cannot create a session as another user (tested).

**Security gates:** SR-1, SR-4, SR-6, SR-7.

**Depends on:** Phase 1 (data), Phase 2 (a real zone to check into).

---

## Phase 4 — On-Device Silence Agent (U3, U4) 🟢 (Android)

**Goal:** While checked in, the phone computes a private silence score and transmits **only** the 0–100 number.

**Modules:** native Android signal module · scoring function · minimal-ingest client · permission onboarding.

**Key tasks:**
- Expo custom native module (Android) reading: screen-off duration, DND/interruption filter, app foreground/background (UsageStatsManager), notification suppression. (See PRD §7.1.)
- Pure, unit-tested **scoring function**: signals → weighted, smoothed `0–100`. (This is the most testable unit — TDD it hard with fixture inputs.)
- Permission onboarding UI in plain language; permissions revocable (SR / HR-P4).
- Score-ingest client: POST **only** `{anon_session_token, zone_id, score, ts}` — nothing else (SR-9 / HR-P1/P2). The ingest endpoint **rejects any extra fields** (SR-4) and is rate-limited (SR-1).
- iOS fallback stub: Focus-mode + honor-system timer (documented limitation, PRD §7.2).

**Deliverable/demo:** Check in, lock phone for a minute, unlock → the app shows a rising silence score; server received only the number (prove via logs that no content/app-names were sent).

**Exit criteria:** scoring function unit tests pass across fixtures; ingest endpoint rejects over-posting; permission flow works; iOS path degrades gracefully.

**Security gates:** SR-1, SR-4, SR-9, and a test asserting the payload contains *only* the four allowed fields (privacy-by-construction).

**Depends on:** Phase 3.

---

## Phase 5 — Quiet Index Engine & Realtime Broadcast (B1, B2) 🟢

**Goal:** The server aggregates anonymized scores into a live Quiet Index and pushes it to app + dashboard within ≤60s.

**Modules:** aggregation engine · quorum guard · realtime channels · map/dashboard live binding.

**Key tasks:**
- Quiet Index engine: weighted average of active sessions' latest scores, with decay; writes `quiet_index` rollups. Pure aggregation logic unit-tested.
- **Quorum guard (SR-10):** only compute/broadcast when ≥3 active check-ins; enforced server-side, not bypassable by a client request. Test the boundary (2 → hidden, 3 → shown).
- Realtime: publish Quiet Index over Supabase Realtime; mobile map blooms and dashboard live feed subscribe and update.
- Latency check: change reflected within 60s (NFR).

**Deliverable/demo:** Simulate 3+ sessions → dashboard live feed and app map both show the Quiet Index climbing in real time.

**Exit criteria:** engine unit tests pass; quorum enforced (tested); realtime updates visible on both clients; ≤60s latency.

**Security gates:** SR-10 (server-side quorum), SR-1 (ingest still limited).

**Depends on:** Phase 4 (real scores), Phase 2 (dashboard to display).

---

## Phase 6 — Rewards, Wallet & Session Summary (B3, U6, U7) 🟢

**Goal:** Meeting a silence threshold earns points; the user sees a calm check-out summary and a wallet they can redeem from.

**Modules:** reward disbursement (server) · wallet ledger · redemption · session summary UI.

**Key tasks:**
- Reward disbursement (B3): **server-verified** threshold check on check-out → write `wallet_ledger` credit. Never trust a client-claimed score (SR-8).
- Wallet (U6): balance from ledger; list venue rewards; redeem flow writes a debit. Redemption is rate-limited and per-user scoped to prevent farming (SR-1/SR-7, risk R6).
- Session summary (U7): minutes achieved, final silence score, simple trend, points earned — styled per Design Brief (quiet celebration, no confetti).
- Anti-gaming: continuous geofence presence + periodic tap-to-stay-checked-in (risk R2).

**Deliverable/demo:** Finish a qualifying session → summary screen → points land in wallet → redeem a reward → balance updates; redemptions are logged.

**Exit criteria:** disbursement is server-verified (client cannot mint points — tested); redemption debits correctly; summary renders.

**Security gates:** SR-1, SR-7, SR-8, SR-13 (audit-log reward disbursement & redemption).

**Depends on:** Phase 5.

---

## Phase 7 — AI: Operator Weekly Digest (B5) 🟢

**Goal:** The FastAPI service turns anonymized, aggregated zone metrics into a plain-English weekly digest with suggestions, shown in the dashboard.

**Modules:** metrics aggregation endpoint · Claude prompt + schema · digest rendering.

**Key tasks:**
- FastAPI endpoint pulls **aggregated, anonymized** metrics only (Quiet Index trend, check-in counts, peak windows, redemptions) — no user-level data leaves the boundary.
- Claude call: structured prompt → **JSON-schema'd response** for reliable rendering; `claude-haiku-4-5` default, `claude-opus-4-8` for the demo showcase. Claude key lives **only** in the service env (SR-2).
- The endpoint requires a valid operator JWT and is scoped to that operator's zones (SR-3/SR-7); input validated with Pydantic (SR-4); rate-limited (SR-1).
- Dashboard renders the digest as readable prose + a few suggestion cards.
- Error hygiene: no stack traces/keys leaked to client on failure (SR-15).

**Deliverable/demo:** Click "Generate weekly digest" on the dashboard → Claude-written summary + suggestions appear for the demo zone.

**Exit criteria:** digest generates from aggregated data only; auth+validation enforced; failures return clean generic errors; key never client-exposed.

**Security gates:** SR-1, SR-2, SR-3, SR-4, SR-7, SR-15.

**Depends on:** Phase 5 (data to summarize).

---

## Phase 8 — Personal Disconnection Coach (U5, on-device) 🟢 (lite)

**Goal:** A private, never-shaming on-device coach that nudges gently based on local signals — the AI hero feature.

**Modules:** on-device rule engine · message library · nudge UI.

**Key tasks:**
- Rule-based nudge engine running **on-device only** — operates on local signals from Phase 4; behavioural data never leaves the phone (HR-P1).
- Curated message library keyed to events (phone picked up early, streak about to break, goal reached). Tone: encouraging, calm, **never guilt** (respects the freedom to reconnect — PRD §8.1).
- Nudge UI per Design Brief "anti-notification" coach card (soft, dismissible, low-urgency).
- Unit-test the rule engine: given signal state X → expected nudge category Y (no network involved).

**Deliverable/demo:** During a session, pick the phone up early → a gentle, supportive nudge appears (not a scolding).

**Exit criteria:** rule engine unit tests pass; nudges fire on the right local events; nothing is transmitted; tone reviewed against the never-shaming rule.

**Security gates:** privacy-by-construction (assert no network egress from the coach).

**Depends on:** Phase 4 (local signals).

---

## Phase 9 — Operator Analytics & Certification Badge (O2, O3, O4) 🔵

**Goal:** Operators get trend charts, the AI digest in context, and an embeddable verified Quiet Index badge.

**Modules:** analytics charts · badge service.

**Key tasks:**
- Analytics (O3): historical Quiet Index trend (Recharts), peak quiet windows, digest panel (from Phase 7).
- Live feed polish (O2).
- Certification badge (O4): a **signed, short-TTL token** endpoint (SR-11) → embeddable SVG/iframe showing average Quiet Index. Test that a forged/stale value is rejected.

**Deliverable/demo:** Operator views trend chart + digest; copies an embed snippet; the badge renders the real average and rejects tampering.

**Exit criteria:** charts render real history; badge token is signed + TTL-bounded (tested); embed works on an external page.

**Security gates:** SR-11, SR-3, SR-7.

**Depends on:** Phase 6/7.

---

## Phase 10 — Security Hardening, Polish & Demo 🟢

**Goal:** Close the security checklist, polish the calm UX, and lock the 90-second demo.

**Modules:** security audit · UX polish · demo script · pitch assets.

**Key tasks:**
- **Full SR-* sweep:** verify SR-1 (rate limits on every endpoint), SR-2 (no secrets in any bundle — grep build output), SR-3 (auth on all internal/AI endpoints), SR-4 (validation everywhere), SR-6 (no string-interpolated SQL — grep), SR-7 (re-run IDOR negative tests), SR-8 (deny-by-default audit), SR-12 (delete-my-data works), SR-13 (audit logs present), SR-14 (`pip-audit`/`npm audit` clean), SR-15 (no leaked errors). Run `/security-review`.
- Accessibility + reduced-motion pass (Design Brief §8).
- Empty/edge states (no zones nearby; cold-start solo mode, risk R3).
- Rehearse the PRD §12.4 demo script end-to-end on a real device.
- Pitch assets: map glow screenshot, live Quiet Index, coach nudge, digest, badge.

**Deliverable/demo:** The full loop runs on a real Android device in ≤90s; security checklist fully green.

**Exit criteria:** all `SR-*` gates pass; demo runs reliably; reduced-motion + empty states handled.

**Security gates:** all of §11.

**Depends on:** Phases 2–9.

---

## Phase ↔ PRD coverage map

| PRD item | Phase |
|---|---|
| U1 map / U2 check-in | 3 |
| U3/U4 silence agent | 4 |
| U5 coach | 8 |
| U6 wallet / U7 summary | 6 |
| B1 Quiet Index / B2 realtime | 5 |
| B3 rewards | 6 |
| B5 weekly digest | 7 |
| O1 zone setup / O5 rewards | 2 |
| O2 live feed / O3 analytics / O4 badge | 9 |
| SR-1…SR-15 | enforced per-phase; final sweep in 10 |
| Schema §9.2 / RLS | 1 |

**Deferred (post-hackathon, per PRD §12.2):** iOS deep detection, forecasting (B6), data export (O6), on-device SLM, social streaks (U8) — not in this plan.

---

## Self-review notes

- **Spec coverage:** every MVP-tagged PRD feature (U1–U7, B1/B2/B3/B5, O1/O2/O4/O5) and all SR-* requirements map to a phase (see table). Deferred items explicitly excluded.
- **Security woven in:** SR gates appear in the phase that introduces the relevant surface, not just Phase 10 — matching the PRD's "security as first-class" stance.
- **Granularity:** phases are kept module-sized on purpose; each will be expanded into bite-sized TDD tasks at execution time so working documents stay small and reviewable.
- **Type consistency:** shared contracts (`Session`, `ScorePing`, `Zone`, etc.) are centralized in `packages/shared-types` in Phase 1, so later phases can't drift.
