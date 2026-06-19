# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository currently contains **only planning documents** — no code has been scaffolded yet. The three source-of-truth documents live in [documents/](documents/):

- [Hush-PRD.md](documents/Hush-PRD.md) — product requirements, feature IDs (`U*` user app, `B*` backend, `O*` operator console, `SR*` security requirements), architecture, and the privacy/security threat model.
- [Hush-Implementation-Plan.md](documents/Hush-Implementation-Plan.md) — the phased master build plan (Phases 0–10). **This drives all build work.**
- [Hush-Design-Brief.md](documents/Hush-Design-Brief.md) — visual direction, palette (exact hex), screen list, and motion rules.

When code exists, update this file with real build/test/lint commands.

## What Hush is

A 100% software platform (no hardware) that turns a physical place into a measurable, rewarded zone of intentional digital silence. The product's core metric is the **Quiet Index** — a live `0–100` score of how digitally disconnected a zone is right now. Per-user, only an anonymized `0–100` **silence score** ever leaves the device.

## Planned architecture (monorepo)

A monorepo with three deployable apps over one Supabase backend. Boundary principle: **split by responsibility, not layer.**

```
hush/
├─ apps/
│  ├─ mobile/      # React Native + Expo, TypeScript, custom dev client (Android-first user app)
│  ├─ dashboard/   # Next.js + Tailwind + Recharts (operator console, web)
│  └─ ai-service/  # FastAPI + Pydantic + SQLAlchemy (Claude orchestration, Quiet Index helpers)
├─ packages/
│  ├─ shared-types/ # TS contracts shared by mobile + dashboard (Zone, Session, ScorePing…)
│  └─ config/       # shared lint/tsconfig/env schema
├─ supabase/
│  ├─ migrations/   # SQL migrations: schema + RLS policies
│  └─ seed/         # demo operator + demo zone
└─ .env.example     # every required var documented; real .env is git-ignored
```

- **Backend:** Supabase = Postgres + **PostGIS** (geofencing) + Auth + Realtime. One dependency, not five.
- **AI:** FastAPI service calls the **Claude API** (`claude-haiku-4-5` for routine digests, `claude-opus-4-8` for the demo showcase). The Claude key lives **only** in the service env.
- **Realtime:** Supabase Realtime channels push the Quiet Index to app + dashboard within ≤60s.
- **Shared contracts** (`Session`, `ScorePing`, `Zone`) are centralized in `packages/shared-types` so the three apps can never drift.

## How build work is structured

**Phases are the unit of work.** Do NOT try to execute the whole implementation plan at once. The dependency order is: Phase 0 → 1 → {2, 3} → 4 → 5 → {6, 7} ; 8 depends on 4 ; 9 on 6/7 ; 10 last.

For each phase:
1. Expand it into a detailed TDD task plan using the `superpowers:writing-plans` skill.
2. Build it with `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
3. A phase is only **done** when its tests pass, it is committed, and (from Phase 2 on) something is visibly demoable — and its listed `SR-*` security gates pass.

## Non-negotiable constraints

These are architectural guarantees, not nice-to-haves. They appear in the PRD as hard requirements and must hold in every phase.

**Privacy by construction (PRD §7.3):**
- No notification/message content, app names, URLs, or keystrokes are ever read, stored, or transmitted.
- The score-ingest endpoint accepts **only** `{anon_session_token, zone_id, score(0–100), ts}` and must reject any extra field.
- The Quiet Index is computed/broadcast only when a **quorum** (≥3 active check-ins) is met — enforced server-side, never bypassable by a client.

**Security enforced server-side from Phase 1 (PRD §11), never bolted on at the end:**
- **SR-2** No secrets in any client bundle. Supabase clients use the anon/public key + RLS — **never** the service-role key. Claude key only in the FastAPI env.
- **SR-6** All DB access parameterized (Supabase client / SQLAlchemy). Never string-interpolate user input into SQL — including PostGIS point-in-polygon queries.
- **SR-7 / SR-8** Authorization is primarily Postgres **Row-Level Security** (users access only `user_id = auth.uid()` rows; operators only their own zones), deny-by-default, with UUID primary keys. Every RLS policy needs a **negative test** (the IDOR guard). The frontend is untrusted; hiding a button is UX, not security.
- **SR-1 / SR-4** Every endpoint rate-limited and validated (Pydantic / zod) before any DB or LLM call.
- Reward disbursement is **server-verified** — never trust a client-claimed score.

**Design tone (Design Brief §2):** this is the *anti–social-media* app. Calm over engagement: no red badges, no count dots, no confetti, no anxious spinners. One focal point per screen, generous negative space, breathing (~4s) glow animations, and reduced-motion as a first-class state. Color carries meaning in exactly one place — the Quiet Index glow.

## Conventions

- **Android-first**, and honest about iOS limits (iOS falls back to Focus-mode + honor-system; documented, not overclaimed).
- TDD is expected: the silence **scoring function** and the Quiet Index **aggregation engine** are pure, fixture-tested units — test them hard.
- Run `pip-audit` / `npm audit` before submission (SR-14); run `/security-review` in the final hardening phase.
