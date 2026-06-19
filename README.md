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

## Security baseline
- No secrets in any client bundle (SR-2). Clients use only the Supabase **anon** key.
  The service-role key and Claude key live only in `apps/ai-service` env.
- Run `npm run audit` before submission (SR-14).
