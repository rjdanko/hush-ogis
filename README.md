# Hush

A 100% software platform that turns a physical place into a measurable, rewarded
zone of intentional digital silence. Core metric: the **Quiet Index** (0–100).

## Repo layout
- `apps/mobile` — Expo / React Native user app (Android-first)
- `apps/dashboard` — Next.js operator console
- `apps/ai-service` — FastAPI Claude orchestration service
- `packages/shared-types` — TS contracts shared by mobile + dashboard
- `packages/config` — shared tsconfig + env schema
- `supabase/` — Postgres/PostGIS migrations + seed

## Prerequisites
Node 20+, Python 3.11+, git. Optional: Supabase CLI (for the live backend).

## Quick start
```bash
cp .env.example .env          # fill in values; .env is git-ignored (SR-2)
npm install                   # installs JS workspaces
npm run dev:ai -- --setup     # creates the Python venv + installs ai-service deps
npm run dev                   # boots dashboard + mobile + ai-service
```

Next.js only reads `.env*` files from the package it's run in, not the repo
root — `apps/dashboard` needs its own `.env.local` with the `NEXT_PUBLIC_*`
values from the root `.env` (same values `npx supabase status -o env` prints),
or `npm run dev:dashboard` will 500 with "Your project's URL and Key are
required."

## Security baseline
- No secrets in any client bundle (SR-2). Clients use only the Supabase **anon** key.
  The service-role key and Claude key live only in `apps/ai-service` env.
- Run `npm run audit` before submission (SR-14).

### Audit baseline (as of Phase 0)
- `pip-audit`: **clean** (no known vulnerabilities).
- `npm audit --audit-level=high`: 6 high / 23 moderate, **all transitive build-time
  deps of the Expo SDK 52 toolchain** (`@xmldom/xmldom`, `tar` via `@expo/cli` /
  `@expo/prebuild-config`). None come from app code and none ship in a client bundle.
  Fix path is an Expo SDK upgrade (not `audit fix --force`, which downgrades to a
  canary); tracked for the Phase 10 hardening sweep.
