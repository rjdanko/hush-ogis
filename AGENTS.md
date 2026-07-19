# AGENTS.md — setup & run guide for AI coding agents

This file tells any AI agent (Codex, Cursor, Copilot, Claude Code without
`CLAUDE.md` loaded, etc.) how to get **Hush** running locally and how to run
its three apps. It is a practical run-book, not the architecture doc — for
product/architecture/security requirements read [CLAUDE.md](CLAUDE.md) and
[documents/](documents/) first.

> **Note on repo state:** `CLAUDE.md`'s "Current state" section says only
> planning docs exist. That is stale — this repo is fully scaffolded
> (Phases 0–9 built): `apps/mobile`, `apps/dashboard`, `apps/ai-service`,
> `packages/shared-types`, `packages/config`, and `supabase/migrations` all
> contain real, tested code. Trust the file tree over that paragraph.

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

## Rules for agents working in this repo

- **Never print, log, or commit the contents of `.env`, `.env.local`, or
  `supabase/self-host/.env`.** They hold live secrets (Groq key, Supabase
  service-role key, JWT signing secret, Mapbox/Google Maps tokens) for this
  developer's local stack. All are already git-ignored — keep it that way.
- **Never put the Supabase service-role key or the Groq key in
  `apps/mobile` or `apps/dashboard`.** Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
  vars belong in those two apps' env files (SR-2, see `CLAUDE.md`).
- Before starting `supabase/self-host`'s docker-compose, run the `ps`
  check above — it's frequently already up from a prior session, and
  `docker compose down -v` wipes the Postgres data volume.
- Follow the phased build plan in `documents/Hush-Implementation-Plan.md`
  and the TDD/security conventions in `CLAUDE.md` for any new feature work;
  this file only covers getting the stack running.
