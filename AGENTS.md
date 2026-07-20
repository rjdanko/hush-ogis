# AGENTS.md — architecture, setup & run guide for AI coding agents

This file tells any AI agent (Codex, Cursor, Copilot, Claude Code, etc.) how to understand the architecture, get **Hush** running locally, and run its three apps. It is a practical run-book combined with architecture and security requirements. The product documents live in [documents/](documents/).

> **Note on repo state:** This repo is fully scaffolded (Phases 0–9 built): `apps/mobile`, `apps/dashboard`, `apps/ai-service`, `packages/shared-types`, `packages/config`, and `supabase/migrations` all contain real, tested code. 
> The three source-of-truth documents live in [documents/](documents/):
> - [Hush-PRD.md](documents/Hush-PRD.md) — product requirements, feature IDs (`U*` user app, `B*` backend, `O*` operator console, `SR*` security requirements), architecture, and the privacy/security threat model.
> - [Hush-Implementation-Plan.md](documents/Hush-Implementation-Plan.md) — the phased master build plan (Phases 0–10). **This drives all build work.**
> - [Hush-Design-Brief.md](documents/Hush-Design-Brief.md) — visual direction, palette (exact hex), screen list, and motion rules.

## What Hush is

A 100% software platform (no hardware) that turns a physical place into a measurable, rewarded zone of intentional digital silence. The product's core metric is the **Quiet Index** — a live `0–100` score of how digitally disconnected a zone is right now. Per-user, only an anonymized `0–100` **silence score** ever leaves the device.

## Planned architecture (monorepo)

A monorepo with three deployable apps over one Supabase backend. Boundary principle: **split by responsibility, not layer.**

```
hush/
├─ apps/
│  ├─ mobile/      # React Native + Expo, TypeScript, custom dev client (Android-first user app)
│  ├─ dashboard/   # Next.js + Tailwind + Recharts (operator console, web)
│  └─ ai-service/  # FastAPI + Pydantic + SQLAlchemy (LLM orchestration, Quiet Index helpers)
├─ packages/
│  ├─ shared-types/ # TS contracts shared by mobile + dashboard (Zone, Session, ScorePing…)
│  └─ config/       # shared lint/tsconfig/env schema
├─ supabase/
│  ├─ migrations/   # SQL migrations: schema + RLS policies
│  └─ seed/         # demo operator + demo zone
└─ .env.example     # every required var documented; real .env is git-ignored
```

- **Backend:** Supabase = Postgres + **PostGIS** (geofencing) + Auth + Realtime. One dependency, not five.
- **AI:** FastAPI service calls **Groq's free-tier API** (`openai/gpt-oss-120b`, an open-weight model, via strict JSON-schema structured output) for the operator digest. The Groq key lives **only** in the service env.
- **Realtime:** Supabase Realtime channels push the Quiet Index to app + dashboard within ≤60s.
- **Shared contracts** (`Session`, `ScorePing`, `Zone`) are centralized in `packages/shared-types` so the three apps can never drift.

## Stack summary

| App | Tech | Dev port |
|---|---|---|
| `apps/mobile` | Expo / React Native (Android-first) | Metro on 8081 |
| `apps/dashboard` | Next.js | http://localhost:3000 |
| `apps/ai-service` | FastAPI (Python) | http://localhost:8000 |
| Backend | Supabase (Postgres + PostGIS + Auth + Realtime) | Kong gateway on http://localhost:54321 |

Prerequisites: **Node 20+** (tested with Node 24), **Python 3.11+** (tested
with 3.12), **Docker Desktop**, git. An Android emulator (Android Studio /
AVD) or physical device is needed to actually see the mobile app.

## First-time setup (fresh clone)

1. **Env file**
   ```bash
   cp .env.example .env
   ```
   Fill in: `GROQ_API_KEY` (free tier, https://console.groq.com),
   `NEXT_PUBLIC_MAPBOX_TOKEN` (free, https://account.mapbox.com/access-tokens/).
   The Supabase block (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`) is filled in **after**
   step 3, once you know which Supabase backend you're using.
   `BADGE_SIGNING_SECRET` — generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

2. **Install JS + set up the Python venv**
   ```bash
   npm install
   npm run dev:ai -- --setup   # creates apps/ai-service/.venv, installs -e .[dev]
   ```

3. **Start the local Supabase backend.** Two paths exist — check which
   applies to this machine before picking one:

   **Path A — Supabase CLI works** (most machines):
   ```bash
   npx supabase start
   npx supabase status -o env   # prints SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
   ```

   **Path B — CLI binary is blocked** (this happens on Windows with Smart
   App Control enabled — the `supabase` binary itself won't run). A
   pre-built docker-compose fallback lives in `supabase/self-host/` — a
   trimmed self-hosted Supabase stack (Postgres+PostGIS, GoTrue auth,
   PostgREST, Realtime, Kong, Studio). **Check first whether it's already
   running** before starting it again:
   ```bash
   docker compose -f supabase/self-host/docker-compose.yml --env-file supabase/self-host/.env ps
   ```
   If not running:
   ```bash
   cd supabase/self-host
   docker compose up -d
   bash apply-migrations.sh     # applies supabase/migrations/*.sql + seed/seed.sql via psql in the db container
   cd ../..
   ```
   `supabase/self-host/.env` already contains generated secrets (JWT
   secret, anon/service-role keys derived from it, Postgres password) —
   it's git-ignored, never regenerate it unless it's missing; regenerating
   invalidates every JWT signed with the old secret.
   Studio (data browser UI) is reachable at http://localhost:54321 once
   Kong is healthy, using `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` from
   that same `.env`.

   Either path, the gateway ends up on **`http://localhost:54321`**.

4. **Populate the root `.env`'s Supabase block** with the URL/anon
   key/service-role key/JWT secret from whichever path you used (step 3's
   command output for Path A, or `supabase/self-host/.env`'s
   `SUPABASE_PUBLIC_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`/`JWT_SECRET` for Path B).

5. **Per-app env files** — neither Next.js nor Expo reads the repo-root
   `.env`; each app needs its own file with the values copied over:
   - `apps/dashboard/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
     `AI_SERVICE_URL=http://localhost:8000`.
   - `apps/mobile/.env.local` — `EXPO_PUBLIC_SUPABASE_URL`,
     `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
     (Android Maps SDK key, restricted to the debug keystore's SHA-1).
     **On the Android emulator, `EXPO_PUBLIC_SUPABASE_URL` must be
     `http://10.0.2.2:54321`**, not `localhost` — the emulator's loopback
     alias for the host machine. On a physical device over USB/Wi-Fi, use
     the host machine's LAN IP instead.
   Skipping this step is the #1 cause of "Your project's URL and Key are
   required" 500s from the dashboard, or silent auth failures on mobile.

## Running the apps

All three at once:
```bash
npm run dev
```
Or individually:
```bash
npm run dev:dashboard   # Next.js on :3000
npm run dev:mobile      # Expo/Metro; press `a` in the terminal for Android
npm run dev:ai          # FastAPI/uvicorn on :8000, --reload
```

### Windows quick-start: dashboard + AI service

From the repository root in PowerShell, start the dashboard with:
```powershell
npm run dev:dashboard
```
It should be available at `http://localhost:3000`.

`npm run dev:ai` delegates to `bash scripts/run-ai.sh`. On some Windows
installations the available `bash` does not support `set -o pipefail`, so the
script exits before Uvicorn starts. When that happens, use the equivalent
command directly from the repository root:
```powershell
apps/ai-service/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir apps/ai-service --port 8000 --reload
```
Verify the service at `http://127.0.0.1:8000/health`. Keep both terminals
open while using dashboard features that call the AI service.

### Windows quick-start: mobile app in an Android emulator

Starting Metro alone does not display the mobile app. Start Metro first:
```powershell
npm run dev:mobile
```

Then discover and launch an existing Android Virtual Device (AVD). The
emulator executable is commonly not on `PATH`, so use its SDK location:
```powershell
$emulator = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
& $emulator -list-avds
& $emulator -avd Hush_Test
```
Wait for the emulator to reach the Android home screen, then make the host's
Metro server reachable from it:
```powershell
adb wait-for-device
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

This repository includes a native Android project. Prefer its development
build over Expo Go (which may not be installed on the emulator):
```powershell
npm run android --workspace apps/mobile -- --no-bundler
```
The first native build can take several minutes. After it has been installed,
the app package is `com.hush.app`; launch it again with:
```powershell
adb -s emulator-5554 shell monkey -p com.hush.app -c android.intent.category.LAUNCHER 1
```

If `Hush_Test` is not listed, create or start the intended device in Android
Studio's Device Manager, then substitute its AVD name in the command above.

### Stopping local development processes

Use `Ctrl+C` in each terminal that started a service. To close the Android
emulator from PowerShell:
```powershell
adb -s emulator-5554 emu kill
```
If a background service was started outside an interactive terminal, first
identify its listener with `Get-NetTCPConnection -State Listen -LocalPort
3000,8000,8081`, then stop only the corresponding process ID.

## Verifying it actually works

```bash
npm run typecheck              # tsc -b across workspaces
npm test --workspace apps/dashboard   # vitest
npm test --workspace apps/mobile      # vitest
cd apps/ai-service && .venv/Scripts/python -m pytest   # (.venv/bin/python on macOS/Linux)
```
End-to-end smoke against a live stack (requires Supabase running + `npm run dev:ai`):
```bash
node scripts/e2e-full-loop.mjs        # full demo loop: check-in -> quiet index -> points -> redeem -> badge
node scripts/simulate-quiet-index.mjs # quorum/aggregation only
node scripts/verify-wallet-flow.mjs   # points/wallet/redeem only
node scripts/verify-live-quiet-index.mjs
```
Database-level RLS/logic tests (pgTAP) live in `supabase/tests/database/` —
every RLS policy has a negative (IDOR) test per `CLAUDE.md`'s SR-7/SR-8.

## How build work is structured

**Phases are the unit of work.** Do NOT try to execute the whole implementation plan at once. The dependency order is: Phase 0 → 1 → {2, 3} → 4 → 5 → {6, 7} ; 8 depends on 4 ; 9 on 6/7 ; 10 last.

For each phase:
1. Expand it into a detailed TDD task plan.
2. Build it and test it.
3. A phase is only **done** when its tests pass, it is committed, and (from Phase 2 on) something is visibly demoable — and its listed `SR-*` security gates pass.

## Non-negotiable constraints

These are architectural guarantees, not nice-to-haves. They appear in the PRD as hard requirements and must hold in every phase.

**Privacy by construction (PRD §7.3):**
- No notification/message content, app names, URLs, or keystrokes are ever read, stored, or transmitted.
- The score-ingest endpoint accepts **only** `{anon_session_token, zone_id, score(0–100), ts}` and must reject any extra field.
- The Quiet Index is computed/broadcast only when a **quorum** (≥3 active check-ins) is met — enforced server-side, never bypassable by a client.

**Security enforced server-side from Phase 1 (PRD §11), never bolted on at the end:**
- **SR-2** No secrets in any client bundle. Supabase clients use the anon/public key + RLS — **never** the service-role key. Groq key only in the FastAPI env.
- **SR-6** All DB access parameterized (Supabase client / SQLAlchemy). Never string-interpolate user input into SQL — including PostGIS point-in-polygon queries.
- **SR-7 / SR-8** Authorization is primarily Postgres **Row-Level Security** (users access only `user_id = auth.uid()` rows; operators only their own zones), deny-by-default, with UUID primary keys. Every RLS policy needs a **negative test** (the IDOR guard). The frontend is untrusted; hiding a button is UX, not security.
- **SR-1 / SR-4** Every endpoint rate-limited and validated (Pydantic / zod) before any DB or LLM call.
- Reward disbursement is **server-verified** — never trust a client-claimed score.

**Design tone (Design Brief §2):** this is the *anti–social-media* app. Calm over engagement: no red badges, no count dots, no confetti, no anxious spinners. One focal point per screen, generous negative space, breathing (~4s) glow animations, and reduced-motion as a first-class state. Color carries meaning in exactly one place — the Quiet Index glow.

## Rules for agents working in this repo

- **Android-first**, and honest about iOS limits (iOS falls back to Focus-mode + honor-system; documented, not overclaimed).
- TDD is expected: the silence **scoring function** and the Quiet Index **aggregation engine** are pure, fixture-tested units — test them hard.
- Run `pip-audit` / `npm audit` before submission (SR-14); run `/security-review` in the final hardening phase.
- **Never print, log, or commit the contents of `.env`, `.env.local`, or
  `supabase/self-host/.env`.** They hold live secrets (Groq key, Supabase
  service-role key, JWT signing secret, Mapbox/Google Maps tokens) for this
  developer's local stack. All are already git-ignored — keep it that way.
- **Never put the Supabase service-role key or the Groq key in
  `apps/mobile` or `apps/dashboard`.** Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
  vars belong in those two apps' env files (SR-2, see architectural constraints).
- Before starting `supabase/self-host`'s docker-compose, run the `ps`
  check above — it's frequently already up from a prior session, and
  `docker compose down -v` wipes the Postgres data volume.
- Follow the phased build plan in `documents/Hush-Implementation-Plan.md`
  and the TDD/security conventions for any new feature work;
  this file covers getting the stack running and the architectural constraints.
