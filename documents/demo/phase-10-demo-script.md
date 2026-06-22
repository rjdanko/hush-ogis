# Phase 10 demo script: the ≤90-second Hush loop

This is the live-demo run-of-show for judges/stakeholders, plus a checklist
for capturing standalone pitch assets (screenshots/clips) outside the timed
loop. Every fact below — operator credentials, zone/reward names, point
math, screen copy, fallback behavior — was verified by reading the actual
seed data and source files in this repo as of Phase 10, not assumed from the
PRD alone. Where the PRD and the code agree, both are cited; where there's a
real gap, it's called out explicitly rather than written around.

## 0. Pre-flight (do this the night before, not 5 minutes before)

### 0.1 Start the stack

From the repo root:

```bash
npx supabase start       # local Postgres + PostGIS + Auth + Realtime
npx supabase db reset     # re-applies migrations and supabase/seed/seed.sql
npm run dev               # runs scripts/dev.mjs: boots dashboard + mobile + ai-service together
```

`npm run dev` (defined in the root `package.json`) spawns three child
processes via `scripts/dev.mjs`:
- `dashboard` → `npm run dev --workspace apps/dashboard` (Next.js, default port 3000)
- `mobile` → `npm run start --workspace apps/mobile` (Expo dev server)
- `ai-service` → `bash scripts/run-ai.sh` (FastAPI/uvicorn on `AI_SERVICE_PORT`, default 8000)

If you'd rather start `ai-service` standalone (e.g. to watch its logs
separately), `scripts/run-ai.sh` also supports a one-time venv setup:

```bash
bash scripts/run-ai.sh --setup   # creates apps/ai-service/.venv, installs deps
bash scripts/run-ai.sh           # runs uvicorn app.main:app --reload
```

### 0.2 Required env vars

Copy `.env.example` → `.env` (root) and `apps/mobile/.env.example` →
`apps/mobile/.env.local`, then fill in real values. Per the comments in
those files:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — from `npx supabase status -o env`.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never goes in `apps/mobile` or
  `apps/dashboard` client bundles (SR-2).
- `ANTHROPIC_API_KEY` — ai-service only. `DIGEST_MODEL` defaults to
  `claude-haiku-4-5`; the demo showcase can override to `claude-opus-4-8`.
- `SUPABASE_JWT_SECRET` — lets ai-service verify operator JWTs locally (HS256).
- `BADGE_SIGNING_SECRET` — signs the embeddable certification badge JWT
  (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `BADGE_TOKEN_TTL_SECONDS` — defaults to 300; the badge link in the
  dashboard expires after this many seconds.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — dashboard browser bundle.
- `NEXT_PUBLIC_MAPBOX_TOKEN` — zone-drawing map in the operator console.
- `AI_SERVICE_URL` — the dashboard's server-side proxy target for
  digest/analytics/badge-token requests; **also** the public base URL baked
  into the badge `<img src>` returned to the browser. In local dev one value
  covers both roles; don't worry about splitting it for this demo.
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — mobile bundle
  (copy into `apps/mobile/.env.local`, since Expo doesn't read the repo-root `.env`).
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — Android Maps SDK key, restricted to
  package `com.hush.app` + your debug keystore's SHA-1.

### 0.3 Demo operator login

Seeded by `supabase/seed/seed.sql`:

- **Email:** `demo-operator@hush.local`
- **Password:** `DemoOperator123!`
- Venue/operator name: **Demo Cafe**

Sign in at the dashboard's `/login` page (`apps/dashboard/app/login/page.tsx`)
with an email + password form. This logs you into the operator console for
the seeded zone.

### 0.4 Seeded zone and reward (exact names — don't paraphrase on slides)

- Zone: **"Demo Cafe"** (id `00000000-0000-0000-0000-00000000000a`), a
  PostGIS polygon roughly centered in Metro Manila. `silence_contract`
  suggests 45 minutes. `reward_config`:
  - `earn_rate_per_quiet_minute: 1`
  - `min_score_for_earning: 70`
  - `daily_point_cap: 120`

  In plain terms: a session only accrues points for minutes where the live
  silence score is **≥ 70**, at **1 point per eligible quiet minute**, capped
  at **120 points/day** per user.
- Reward: **"Free coffee"**, costs **50 points** (id
  `00000000-0000-0000-0000-00000000000b`).

### 0.5 The quorum gap — read this before promising a live multi-phone demo

The Quiet Index only publishes once **≥ 3 active check-ins** exist in a zone
(SR-10) — this is enforced server-side, not a UI nicety. Below quorum, both
the mobile map and the dashboard's live reading show "no reading yet," never
a fabricated number (`MapScreen.tsx` renders a dim neutral `NO_READING_COLOR`
bloom rather than calling `quietIndexGlowColor(0)` for exactly this reason).

**There are no seeded "regular user" demo accounts** — `seed.sql` only
creates the one operator. The mobile app's only sign-in path
(`apps/mobile/lib/auth.ts`) is Supabase **anonymous sign-in**
(`supabase.auth.signInAnonymously()`) — there is no email/password self-signup
screen in the app to create named throwaway testers. So achieving quorum
live, in front of an audience, with 3 separate phones each doing their own
anonymous sign-in and manual check-in, is the realistic path — but it is
genuinely fragile under demo pressure (3 people, 3 devices, 3 manual
check-ins, all before you start your own timed 90s loop).

**The reliable workaround is the headless quorum simulator:**

```bash
npx supabase start          # if not already running
node scripts/simulate-quiet-index.mjs
```

Verified by reading the script itself (`scripts/simulate-quiet-index.mjs`):
it signs in **3 separate anonymous Supabase users**, inserts a `sessions` row
for each directly into the seeded Demo Cafe zone (`zone_id =
00000000-0000-0000-0000-00000000000a`), then sends rising score pings (start
at 40, +10 per tick, capped at 95) every 15 seconds for 6 ticks via the
`ingest_score_ping` RPC. It logs each tick's `quiet_index` row (or "no row
yet — quorum not met or cron hasn't ticked") read back through a **fresh,
separately-authenticated anonymous client**, to prove the value is genuinely
public and not an artifact of the sessions' own auth context.

**Recommended demo setup:** start `simulate-quiet-index.mjs` in a terminal
2–3 minutes before your live segment so quorum is already met and the index
is already trending upward by the time you open the map. Treat your own
phone's check-in as the 4th (real) participant — the Quiet Index will keep
climbing as your real session's score rises, which is the moment you want
on screen.

**Honest limitation to state out loud if asked:** there is currently no
self-service way to create 3 *named, returning* demo testers — anonymous
sign-in is by design (privacy-by-construction, no PII), but it also means
"get 3 humans checked in" has no scripted path beyond literally handing out
3 phones or running the simulator. This is a real demo-readiness gap, not
a script limitation — flag it to whoever owns Phase 10 rehearsal.

---

## 1. The ≤90-second loop

Assumes quorum is already satisfied (simulator running, or 2 other testers
already checked in) before you start the clock.

| # | Step | Action | Expected result | Time budget |
|---|------|--------|------------------|-------------|
| 1 | Open map | Launch the mobile app to `MapScreen` | Demo Cafe renders as a glowing bloom; color reflects the current Quiet Index via `quietIndexGlowColor`, or the dim neutral "no reading yet" color if quorum somehow isn't met | 0–8s |
| 2 | Select zone | Tap the Demo Cafe marker | `ZoneDetailScreen` opens, showing zone name "Demo Cafe" and a geofence check ("You're inside this zone." / "you can still check in manually" if location is inconclusive) | 8–14s |
| 3 | Set intention (optional) | Type quiet minutes, e.g. `45`, into the optional field | No validation error; field accepts the number | 14–20s |
| 4 | Check in | Tap "Check in" | `createCheckIn` inserts a `sessions` row server-side; app transitions to `ActiveSessionScreen` | 20–26s |
| 5 | Lock phone / go quiet | Physically lock the phone or stop interacting | On-device silence signals feed `computeSilenceScore`; the live orb shows a rising "YOUR SILENCE" score; a slow-breathing halo animates (2s in/out) unless reduced-motion is on | 26–45s |
| 6 | Quiet Index climbs | Glance back at the dashboard or a second phone on the map | Once ≥3 active check-ins exist, the zone's Quiet Index value is visible and trending upward (confirm via dashboard `LiveQuietIndex` panel or the map bloom's color/intensity) | 45–55s |
| 7 | Coach nudge (incidental) | If the score sustains ≥70 across the last 4 ticks, or you briefly foreground the phone | A `CoachCard` cross-fades in over ~900ms with a calm, non-shaming message (e.g. "Your quiet time is adding up. Nicely done." for sustained high score, or "Welcome back. The quiet's still here whenever you are." if you foreground the app) | opportunistic, no dedicated budget |
| 8 | Check out | Tap "Check out" | `checkOutSession` calls the server-verified `checkout_session` RPC; `achieved_minutes` and `final_score` are computed server-side, never client-supplied | 55–62s |
| 9 | Session summary | `SessionSummaryScreen` renders | Three tiles: QUIET MINUTES, AVERAGE SILENCE, POINTS AWARDED (accent-colored). If points > 0, hint reads "Your wallet has been credited." | 62–70s |
| 10 | Open wallet | Tap "View wallet" | `WalletScreen` shows the updated points balance and the reward list, including **"Free coffee — 50 points"** | 70–76s |
| 11 | Redeem reward | Tap "Redeem" on Free coffee (only enabled if balance ≥ 50) | `redeemReward` succeeds; balance refreshes; confirmation text "Redeemed: Free coffee" appears | 76–84s |
| 12 | Show the digest (operator side) | Switch to the already-open dashboard zone page, click "Generate weekly digest" in `DigestPanel` | A Claude-generated summary + 2–3 suggestion cards render under the button | 84–90s (cut here if the loop is strictly timed; digest generation latency varies) |

**On a zero-points run:** if the session was too short or too noisy, step 9
shows 0 in the POINTS AWARDED tile and one of two specific hints instead of
the generic fallback — verified in `apps/mobile/lib/scoring.ts`
(`sessionSummaryHint`):
- Too short (achieved minutes below the threshold, or null): "Not enough
  quiet time recorded yet — stay checked in a little longer."
- Too noisy (final score below the zone's `min_score_for_earning`, i.e. 70
  for Demo Cafe): "This session was a bit too lively to earn points this
  time — a quieter stretch next time should do it."
- Generic fallback (no signal at all — e.g. zero pings recorded): "No points
  this time — stay quietly checked in longer to earn some."

Rehearse a deliberately short/noisy run once so a real zero-points result
mid-demo reads as expected product behavior, not a bug.

---

## 2. Fallbacks

### 2.1 iOS honor-system fallback

Per PRD §7.2 (verified verbatim intent, not paraphrased): "iOS: Apple
restricts programmatic access to screen state and app usage... On iOS the
MVP falls back to: **Focus mode detection + honor-system commitment +
foreground/background of our own app.** This is documented as a known
constraint, with a V1 path via the Screen Time API entitlement." The PRD
explicitly frames this as the honest, on-theme part of the pitch ("Hush is
Android-first and honest about iOS... We do not overclaim"). If demoing on
an iPhone, say this out loud rather than letting silence detection look
broken.

### 2.2 Manual check-in fallback

`ZoneDetailScreen.tsx`'s own comment states the policy plainly: the screen
"Attempts a geofence read first (U2) but always offers a manual-confirm
fallback for demo reliability — per the PRD, geofencing on real devices is
unreliable enough that the check-in itself must never hard-block on it." In
practice: if location permission is denied or the position read is
inconclusive, the status line reads "Couldn't confirm your location — you
can still check in manually," and the Check In button remains enabled
regardless of geofence status. Use this deliberately if venue Wi-Fi/GPS is
flaky on demo day — it is not a bug to work around, it's the documented path.

### 2.3 Dashboard panel graceful degradation (ai-service slow/down)

If `ai-service` isn't running or is slow, the three Claude-backed dashboard
panels degrade calmly rather than crashing — confirmed both by reading the
components and by Phase 9's `scripts/e2e-check.mjs`, which explicitly tests
this:
- `AnalyticsPanel` shows "Could not load analytics just now." instead of a
  chart.
- `DigestPanel` shows "Could not generate the digest just now." instead of a
  summary, and the "Generate weekly digest" button re-enables.
- `BadgeEmbed` shows "Could not generate the badge just now." instead of the
  embed snippet/preview.

`e2e-check.mjs` confirms none of these render a Next.js "Runtime Error"
crash screen — they fail into their own in-component error state. If
ai-service hiccups mid-demo, narrate this as the intended "calm error
state," not a recovery scramble.

---

## 3. Pitch-asset capture checklist

Capture these independently of the timed loop, in a quiet moment with no
audience pressure.

| Asset | Screen / state | How to reach it |
|---|---|---|
| Map glow screenshot | `MapScreen`, Demo Cafe bloom mid-to-high Quiet Index | Run `simulate-quiet-index.mjs` for a couple ticks first so the bloom color reflects a real (not "no reading yet") value, then screenshot the map |
| Live Quiet Index (operator view) | Dashboard `/zones/[id]` page, `LiveQuietIndex` panel | Log in as `demo-operator@hush.local`, open the Demo Cafe zone page; panel is the first one rendered, above Analytics/Digest/Badge |
| Coach nudge | `ActiveSessionScreen`, `CoachCard` visible | Easiest reliable trigger: stay checked in past 30s elapsed for the one-shot "settling" nudge ("Phone down. Take a breath." / one of its 2 other variants), or hold score ≥70 for 4 consecutive ~15s ticks (1 minute) to trigger "quiet_accumulating" ("Your quiet time is adding up. Nicely done."). Avoid foregrounding the app right before the shot unless you specifically want the "phone_picked_up" variant, since that one implies you just unlocked the phone |
| Point accrual / wallet flow | `WalletScreen` after a successful, score-≥70 session | Complete a check-in where the live score stays at/above 70 for several ticks (1 point per eligible minute, capped at 120/day), check out, tap "View wallet" — balance and "Free coffee — 50 points" row both visible |
| Digest | Dashboard `/zones/[id]`, `DigestPanel`, post-generation state | Click "Generate weekly digest" with ai-service running and `ANTHROPIC_API_KEY` set; capture the summary paragraph + suggestion cards, not the "Generating…" loading state |
| Badge | Dashboard `/zones/[id]`, `BadgeEmbed`, post-generation state | Click "Generate embed snippet"; capture the `<img>` preview ("Hush Quiet Index — verified", 220×60) plus the expiry note ("This link expires in N seconds…", `BADGE_TOKEN_TTL_SECONDS`, default 300s) — note the badge token is a signed HS256 JWT (`apps/ai-service/app/badge.py`) carrying only `zone_id` and `avg_value`, verified by signature+expiry alone, never re-touching the DB |

