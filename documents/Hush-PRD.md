# Hush — Product Requirements Document (PRD)

> **Spatial zones of intentional digital absence.**
> Turn any physical space into a measurable, rewarded zone of digital silence.

**Contest:** OGIS Ignite 2026 — *Tsunagaranai Kachi / "Disconnected by Design"*
**Author:** macatulajed@gmail.com
**Date:** 2026-06-19
**Status:** Draft v1 — for review

---

## 0. How to read this document

This PRD is written for two audiences at once:

1. **Hackathon judges** — Sections 1–4 and 12 make the concept, theme-fit, and value legible without engineering detail.
2. **The build team (you)** — Sections 5–11 specify the technical requirements, architecture, and a feasibility-honest delivery plan.

Throughout, features are tagged:

- 🟢 **MVP** — built and demoable during the hackathon.
- 🔵 **V1** — realistic post-hackathon product release.
- 🟣 **Vision** — the futuristic north star (shown in pitch, not built).

---

## 1. Concept Summary

**Hush** turns any physical place — a café, library, co-working floor, classroom, or office — into a **measurable, rewarded zone of intentional digital silence.** (The name says the whole product in one word: a calm, collective *quieting*.)

The platform is **100% software**: a mobile app plus a cloud backend. No hardware to buy, install, or maintain — any venue can become a Hush zone in minutes. This is a deliberate design choice: the barrier to creating a zone of silence should be *near zero*.

The single number at the heart of the product is the **Quiet Index** — a live `0–100` score reflecting how digitally disconnected a zone is *right now*. It is to "focus spaces" what a hygiene rating is to a restaurant: a trustworthy, public, real-time signal.

### One-line pitch
> *Hush measures the value of putting your phone down — and pays you back for it.*

---

## 2. Why this wins the theme

The contest asks students to **explore the value of distance, silence, privacy, solitude, and the freedom to disconnect**, and to **"redesign connections."** Hush is a direct, literal answer:

| Theme principle | How Hush embodies it |
|---|---|
| **Disconnection has value** | The Quiet Index *quantifies* absence — disconnection becomes a measurable, comparable, rewardable asset instead of an invisible sacrifice. |
| **Convenience ≠ benefit** | Hush deliberately removes a convenience (your phone) to deliver a benefit (focus, presence, calm) — and proves the benefit with data. |
| **Narrow & deep over broad & shallow** | By making people present in a shared physical space, Hush nudges relationships back toward depth — you're *here*, not scrolling. |
| **Privacy & boundaries** | Radically privacy-preserving by design: only an anonymised `0–100` score ever leaves the device. No content, no app names, no location history. |
| **Solitude as a social act** | Disconnecting alone feels like opting out. Hush makes disconnection **collective and visible**, removing the social friction of the individual choice. |

### OGIS affinity (their design philosophy, mirrored)
OGIS emphasizes **structuring the essence** of a process over adding superficial features, and asks *what should be connected, why, and to what extent.* Hush's entire architecture is built on that question: it **subtracts** connection deliberately and models the result. The Quiet Index is not a feature bolted on — it is the structural core everything else hangs from. We **redesign the connection** from "always-on by default" to "off by design, on by intent."

---

## 3. The Problem

### 3.1 For individuals
Disconnecting alone is **socially expensive**. Putting your phone away in a group reads as aloof, anxious, or rude. The individual who wants silence has no cover. Result: people stay tethered even when they'd rather not be.

> **Hush's fix:** make collective disconnection the *norm of a space*. When everyone in the café is in a Hush zone, putting your phone down is the expected, social, rewarded thing to do. The friction inverts.

### 3.2 For space operators
A café, library, or co-working space that *wants* to be a "quiet focus space" has **no tool to make that real, provable, or marketable.** "Please be quiet" signs don't scale and can't be measured.

> **Hush's fix:** certification, live data, and a reward system that lets a venue *prove* its quietness, *differentiate* on it, and *attract* the growing market of focus-seeking customers.

### 3.3 The underlying insight
We already measure everything we *connect* to — followers, likes, screen time, engagement. **Nobody measures what we protect by disconnecting.** Hush creates the missing metric for the absence.

---

## 4. Target Users

| Segment | Who | Core need | What they get |
|---|---|---|---|
| **Disconnectors** (primary) | Students, knowledge workers, writers, the digitally-fatigued | Permission + structure to put the phone down without social cost | A normed space, a private goal, gentle coaching, real rewards |
| **Space operators** (primary) | Independent cafés, libraries, co-working spaces, university study halls | A way to create, prove, and market a focus environment | Certification, live dashboard, AI insights, a differentiator |
| **Institutions** (V1) | Universities, corporate facilities teams, mental-health/wellbeing programs | Aggregate, anonymised evidence that disconnection initiatives work | Exportable, privacy-safe analytics for reporting & research |
| **Researchers** (Vision) | Academics studying digital wellbeing, attention, urban design | Ethical, consented, anonymised behavioural data at scale | Opt-in research data partnerships |

---

## 5. Core Functionality (Feature Specification)

### 5.1 Layer 1 — User Mobile App *(always present)*

| # | Feature | Tag | Notes |
|---|---|---|---|
| U1 | **Live zone map** — discover nearby Hush zones; each zone *glows* by current Quiet Index (cold→warm color scale) | 🟢 MVP | Map + realtime overlay |
| U2 | **Geofenced check-in** with a personal **silence commitment** (e.g. "45 min off my phone") | 🟢 MVP | PostGIS geofence + manual confirm fallback |
| U3 | **On-device silence agent** — tracks screen-off duration, DND/Focus state, app foreground/background, notification suppression | 🟢 MVP (Android) | *All on-device. No content read.* See §7. |
| U4 | **Privacy boundary** — only an anonymised `0–100` silence score leaves the device | 🟢 MVP | Hard architectural guarantee |
| U5 | **Personal Disconnection Coach** — on-device AI gives private, gentle, never-shaming nudges and adapts your goals to your real patterns | 🟢 MVP (lite) → 🔵 V1 | **AI hero feature.** See §8.1 |
| U6 | **Reward wallet** — earn points redeemable at the host venue (e.g. free coffee after 5 zone-hours) | 🟢 MVP | Points ledger |
| U7 | **Check-out session summary** — minutes achieved, silence score, personal trend over time | 🟢 MVP | |
| U8 | **Streaks & private milestones** — solitude as a personal practice, not a leaderboard | 🔵 V1 | Deliberately *not* a social feed — on-theme |

### 5.2 Layer 2 — AI Orchestration Backend *(always present)*

| # | Feature | Tag | Notes |
|---|---|---|---|
| B1 | **Quiet Index engine** — aggregates anonymised silence scores from checked-in users into the live zone Index | 🟢 MVP | Weighted average, decay, min-quorum for privacy |
| B2 | **Realtime broadcast** — push live Quiet Index to app + operator dashboard | 🟢 MVP | WebSocket / Realtime channel, ~60s cadence |
| B3 | **Reward disbursement** — trigger points when a user's silence threshold is met | 🟢 MVP | Server-verified |
| B4 | **Pattern detection** — identify zone behaviour patterns ("Tue 9–11am = peak quiet window") | 🔵 V1 | Time-series rollups |
| B5 | **LLM weekly digest** — plain-English weekly report per operator with actionable suggestions | 🟢 MVP (1 call) → 🔵 V1 | **Claude API.** See §8.2 |
| B6 | **Quiet Index forecasting** — predict upcoming quiet windows | 🟣 Vision | ML |

### 5.3 Layer 3 — Operator Console *(web)*

| # | Feature | Tag | Notes |
|---|---|---|---|
| O1 | **Zone setup** — draw boundary on map, set silence contract, reward type & point value | 🟢 MVP | |
| O2 | **Live feed** — realtime Quiet Index, active check-in count, current average silence score | 🟢 MVP | |
| O3 | **Analytics** — historical Quiet Index trends, peak quiet windows, AI weekly digest | 🔵 V1 (charts) | MVP shows basic trend |
| O4 | **Certification badge** — embeddable verified badge showing the venue's average Quiet Index | 🟢 MVP | Trust signal; SVG/iframe |
| O5 | **Reward management** — define rewards, set point values, view redemptions, adjust thresholds | 🟢 MVP | |
| O6 | **Anonymised data export** — CSV/JSON for internal reporting or research partnerships | 🔵 V1 | |

---

## 6. Recommended Tech Stack

Optimized for **hackathon delivery speed**, the **AI/realtime/geo** requirements, and an **honest feasibility story**.

| Layer | Choice | Why |
|---|---|---|
| **Mobile app** | **React Native + Expo** (custom dev client) | Cross-platform, fast iteration; custom dev client allows the native Android modules we need (usage stats, DND). Android-first. |
| **Maps** | `react-native-maps` (Google) or **Mapbox GL** | Mapbox gives nicer "glow" styling for the Quiet Index heat overlay. |
| **Backend platform** | **Supabase** — Postgres + **PostGIS**, Auth, Realtime, Storage, Edge Functions | Massive hackathon accelerator: geofencing (PostGIS), auth, and WebSocket realtime out of the box. One dependency, not five. |
| **AI service** | **FastAPI** (Python) microservice | Clean home for LLM orchestration + future ML; async; calls Claude. |
| **LLM** | **Claude API** (`claude-haiku-4-5` for cheap digests, `claude-opus-4-8` for the showcase digest) | Operator weekly digest + suggestion generation. Haiku keeps cost/latency low for the demo. |
| **On-device coach** | Local rules engine + on-device signals (optionally a small on-device SLM later) | Keeps the personal coach **private by construction** — no behavioural data leaves the phone. |
| **Operator dashboard** | **Next.js** (React) + Tailwind + a charting lib (Recharts) | Fast to build, deploys to Vercel, embeddable badge route. |
| **Realtime** | Supabase Realtime (Postgres changes / broadcast channels) | Avoids hand-rolling a WebSocket server for MVP. |
| **Hosting** | Supabase (cloud) · FastAPI on Render/Fly.io · dashboard on Vercel | All have generous free tiers for a hackathon. |

> **Stack rationale for judges:** every choice trades "perfect" for "demoable by the deadline" while keeping the privacy and realtime guarantees intact. This is what makes the 20% feasibility score defensible.

---

## 7. Silence Detection — Technical Requirements & Honest Limits

This is the **highest-risk technical area** and judges will probe it. We address it head-on.

### 7.1 What "silence" means (on-device signals)
The on-device agent composes a **silence score (0–100)** from signals available *without reading any content*:

| Signal | Android API | Contributes |
|---|---|---|
| Screen-off duration | Screen state broadcasts / `PowerManager` | Strong positive |
| DND / Focus active | `NotificationManager.getCurrentInterruptionFilter()` | Strong positive |
| App foreground/background | `UsageStatsManager` (requires user-granted Usage Access) | Detects active scrolling |
| Notification suppression | `NotificationListenerService` (user-granted) | Confirms quiet |
| Phone unlock frequency | Screen/keyguard events | Inverse signal |

A weighted, smoothed function maps these to `0–100`. **Only that number is transmitted.**

### 7.2 Platform reality (the honest part)
- **Android (target for MVP):** the above APIs exist and are usable with explicit, revocable user permission. ✅ Strongest detection.
- **iOS:** Apple restricts programmatic access to screen state and app usage (Screen Time data is sandboxed; `DeviceActivity`/`FamilyControls` are limited and require special entitlements). On iOS the MVP falls back to: **Focus mode detection + honor-system commitment + foreground/background of our own app.** This is documented as a **known constraint**, with a V1 path via the Screen Time API entitlement.
- **Cross-platform fallback (any device):** "honor-system + heuristics" mode — self-committed timer plus our app's own foreground/background and DND toggle. Lower rigor, universal reach. Anti-gaming safeguards (geofence presence, interaction checks — see §15 R2) keep this honest without any hardware.

> **Framing for judges:** Hush is *Android-first and honest about iOS*, and 100% software — no hardware to deploy. We do not overclaim. Privacy and honesty are themselves on-theme.

### 7.3 Privacy guarantees (hard requirements)
- **HR-P1:** No notification/message content, app names, URLs, or keystrokes are ever read, stored, or transmitted.
- **HR-P2:** Only the anonymised `0–100` score + zone id + timestamp leaves the device.
- **HR-P3:** The Quiet Index for a zone is only published when a **minimum quorum** (e.g. ≥3 active check-ins) is met, so no individual is re-identifiable.
- **HR-P4:** All on-device permissions are explicit, explained in plain language, and revocable.
- **HR-P5:** Users can delete all their data; exports are aggregate-only.

---

## 8. AI Specification

### 8.1 Personal Disconnection Coach (🟢 hero feature, on-device)
A private, **never-shaming** companion that helps each user disconnect on their own terms.

- **Runs on-device** — operates only on local signals; behavioural data never leaves the phone.
- **Adaptive goals:** learns the user's realistic baseline and proposes gentle, achievable commitments ("you usually manage 30 min here — try 40 today?").
- **Tone:** encouraging, calm, opt-in. Celebrates presence; **never** guilt-trips for picking the phone up. This restraint is the design statement — the coach respects the *freedom to reconnect* too.
- **MVP scope:** rule-based nudge engine with a curated message library keyed to live signals (screen picked up early, streak about to break, goal reached).
- **V1 scope:** small on-device language model for natural, varied phrasing — still 100% local.

### 8.2 Operator Weekly Digest (🟢, Claude API)
- Input: **anonymised, aggregated** zone metrics only (Quiet Index trends, check-in counts, peak windows, reward redemptions). No user-level data.
- Output: a plain-English weekly digest with **actionable suggestions** ("Your Quiet Index dips Fridays after 3pm — consider a 'silent happy hour' reward then.").
- Model: `claude-haiku-4-5` for routine weeklies; `claude-opus-4-8` for the demo showcase.
- Implemented as a FastAPI endpoint with a structured prompt + JSON-schema'd response for reliable rendering in the dashboard.

### 8.3 Future AI (🟣 Vision)
Quiet Index forecasting, adaptive per-zone threshold/reward tuning, and (consented) research-grade pattern analysis.

---

## 9. System Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   MOBILE APP (React Native) │        │  OPERATOR DASHBOARD (Next.js) │
│  • Live zone map (glow)     │        │  • Zone setup / live feed     │
│  • Geofenced check-in       │        │  • Analytics / badge / rewards│
│  • On-device Silence Agent  │        └───────────────┬──────────────┘
│  • On-device Coach (private)│                        │
│  • Reward wallet            │                        │
└──────────────┬──────────────┘                        │
   only 0–100 score + zone id + ts                      │
               │                                        │
        ┌──────▼────────────────────────────────────────▼──────┐
        │              SUPABASE (Postgres + PostGIS)            │
        │  Auth · Zones/geofence · Sessions · Scores · Rewards  │
        │  Realtime channels  ◄── live Quiet Index broadcast    │
        └──────┬───────────────────────────────────────┬───────┘
               │ aggregated, anonymised metrics         │
        ┌──────▼───────────────┐                 ┌──────▼───────┐
        │ FastAPI AI Service    │── Claude API ─►│  Claude LLM   │
        │ • Quiet Index calc    │                └──────────────┘
        │ • Weekly digest gen   │
        │ • (V1) pattern/ML     │
        └──────────────────────┘

        100% software — no hardware, no sensors, no install.
```

### 9.1 Data flow (check-in lifecycle)
1. User opens map → app subscribes to nearby zones' Realtime channels → zones glow by current Quiet Index.
2. User enters geofence → check-in with a silence commitment.
3. On-device agent computes a rolling silence score; pushes only the `0–100` value periodically.
4. Backend aggregates active users (≥ quorum) → recomputes zone Quiet Index → broadcasts to app + dashboard.
5. On check-out → session summary; if threshold met → reward disbursed to wallet.
6. Weekly → FastAPI pulls aggregated metrics → Claude generates operator digest.

### 9.2 Core data model (sketch)
- `users` (id, anon handle, prefs)
- `zones` (id, operator_id, name, **geofence: PostGIS polygon**, silence_contract, reward_config)
- `sessions` (id, user_id, zone_id, start, end, committed_minutes, achieved_minutes, final_score)
- `score_pings` (session_id, ts, score) — *aggregate-only retention; prunable*
- `quiet_index` (zone_id, ts, value, active_count) — time-series rollup
- `rewards` (id, zone_id, name, points_cost) / `wallet_ledger` (user_id, delta, reason)
- `operators` (id, venue, badge_token)

---

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Privacy** | HR-P1…HR-P5 (see §7.3) are non-negotiable and demoable. |
| **Realtime latency** | Quiet Index reflects change within ≤ 60s. |
| **Battery** | On-device agent uses OS broadcasts/periodic sampling, not continuous polling; target negligible drain. |
| **Offline tolerance** | Check-in/score buffering when connectivity drops; sync on reconnect. |
| **Accessibility** | Calm, low-stimulation UI; high contrast; respects reduced-motion (ironic to over-animate a calm app). |
| **Trust** | Certification badge cryptographically tied to real, recent data (signed token). |

---

## 11. Security Requirements & Threat Model

Security is treated as a **first-class requirement, not a post-hack patch** — fitting for a product whose entire pitch is *trust and privacy*. The rules below are normative (`SR-*` = Security Requirement) and must be enforced **on the backend**, never assumed from the client.

### 11.1 Guiding principle
> The frontend is an untrusted input source. Every authorization, validation, and rate-limit decision is made server-side. Hiding a button is UX, not security.

### 11.2 API & transport hardening

| ID | Requirement |
|---|---|
| **SR-1 Rate limiting** | Every API endpoint is rate-limited (per-IP **and** per-authenticated-user). Stricter limits on auth, check-in, reward-redeem, and score-ingest endpoints to stop brute-force and reward farming. Return `429` with backoff. Implement at the edge/gateway (e.g. Supabase/Cloudflare) **and** in the FastAPI service (e.g. SlowAPI). |
| **SR-2 No secrets in client** | **No API keys, service-role keys, LLM keys, or DB credentials ever ship in the mobile app or dashboard bundle.** The Claude API key lives only in the FastAPI service env. Supabase clients use the **anon/public key + Row-Level Security**, never the service-role key. Secrets stored in env/secret manager, not in git (`.env` git-ignored; provide `.env.example`). |
| **SR-3 Auth on internal endpoints** | The FastAPI AI service and any admin/operator endpoint require a valid auth token (verified JWT from Supabase) on **every** request. Service-to-service calls use a separate signed service token. No "internal so it's safe" endpoints exposed unauthenticated. |
| **SR-4 Input validation** | All request bodies/params/query strings validated against strict schemas (Pydantic on FastAPI; zod/schema on the dashboard API). Reject unknown fields, enforce types/ranges (e.g. silence score must be int `0–100`; minutes within sane bounds; zone polygon vertex count capped). Validate **before** any DB or LLM call. |
| **SR-5 TLS everywhere** | HTTPS/WSS only. No plaintext transport. HSTS on web. |

### 11.3 Backend vulnerability controls

**SR-6 — SQL Injection**
- All database access uses **parameterized queries / prepared statements or the ORM/query-builder** (Supabase client, SQLAlchemy). **Never** build SQL by string concatenation or f-string interpolation of user input.
- This applies to PostGIS geo-queries too (zone boundary/point-in-polygon lookups take bound parameters, not interpolated coordinates).
- Lint/CI check or code-review gate: flag any raw SQL containing string interpolation of request data.

**SR-7 — IDOR (Insecure Direct Object References)**
- Any endpoint that takes an id from the URL/body (e.g. `/sessions/:id`, `/wallet/:userId`, `/zones/:id`, `/rewards/:id`, `/operators/:id`) must verify the **logged-in principal actually owns or is authorized for that resource** — not merely that they are authenticated.
- Enforce primarily via **Postgres Row-Level Security (RLS)** policies in Supabase (the strongest control here): a user can read/write only rows where `user_id = auth.uid()`; an operator only rows for zones where `operator_id = auth.uid()`. Mirror the check in the FastAPI service for any service-routed access.
- Prefer **non-sequential, unguessable identifiers (UUIDs)** for all externally-referenced records so ids aren't trivially enumerable (defense in depth, not a substitute for RLS).

**SR-8 — Missing authorization on protected/admin routes**
- All sensitive operations (zone create/edit/delete, reward definition, threshold changes, data export, any user-management or admin action) are guarded by **server-side role/permission middleware** checked **before** the handler runs.
- Roles: `user`, `operator`, `admin`. An operator cannot touch another operator's zones; a user can never hit operator/admin routes. Deny-by-default: a route with no explicit allow-rule is forbidden.
- Authorization is enforced in the backend even if the UI already hides the control.

### 11.4 Privacy-specific security (ties to §7.3)

| ID | Requirement |
|---|---|
| **SR-9 Minimal ingest** | The score-ingest endpoint accepts only `{anon_session_token, zone_id, score(0–100), ts}`. Anything else is rejected. Reinforces HR-P1/HR-P2 at the API boundary. |
| **SR-10 Quorum enforcement server-side** | Quiet Index is only computed/broadcast when the privacy quorum (≥3 active) is met — enforced in the engine, never bypassable by a client request. |
| **SR-11 Signed certification badge** | The embeddable badge value is served from a **signed, short-TTL token** so a venue can't forge or stale-cache a fake Quiet Index. |
| **SR-12 Data deletion** | User "delete my data" fully removes/anonymizes their records (right-to-erasure), enforced server-side. |

### 11.5 Operational

- **SR-13 Audit logging** for sensitive actions (reward disbursement, zone deletion, role changes, exports) — without logging private behavioural data.
- **SR-14 Dependency hygiene** — pin dependencies; run an audit (`npm audit` / `pip-audit`) before submission.
- **SR-15 Error hygiene** — no stack traces, SQL errors, or secrets returned to clients; generic messages externally, detail in server logs only.

> **Hackathon-MVP note:** SR-1, SR-2, SR-4, SR-6, SR-7, SR-8 (the OWASP-aligned core: rate limiting, secret handling, input validation, SQLi, IDOR, broken authorization) are **in-scope for the build** — Supabase RLS + Pydantic + a gateway rate-limit cover most of them cheaply. SR-13/14 can be lightweight for the demo but should be named in the pitch.

---

## 12. Hackathon Delivery Plan (MVP scope)

**Goal:** a runnable demo judges can touch, proving the loop *check-in → on-device silence → live Quiet Index → reward → AI digest.*

### 12.1 MVP cut line (build these)
- Android app: map with zone glow (U1), geofenced/confirm check-in (U2), on-device silence agent (U3/U4), reward wallet (U6), session summary (U7), rule-based coach lite (U5).
- Backend: Quiet Index engine (B1), realtime broadcast (B2), reward disbursement (B3), one Claude weekly digest (B5).
- Operator dashboard: zone setup (O1), live feed (O2), badge (O4), reward management (O5).

### 12.2 Explicitly deferred (say so in the pitch)
- iOS deep detection, forecasting, data export, on-device SLM, social streaks.

### 12.3 Suggested build order
1. Supabase schema + PostGIS zones + auth.
2. Operator dashboard zone setup → seed a demo zone.
3. App: map + glow + check-in against the seed zone.
4. On-device silence agent (Android signals) → push score.
5. Quiet Index engine + realtime broadcast → watch the map glow live.
6. Rewards + session summary.
7. FastAPI + Claude weekly digest → render in dashboard.
8. Coach-lite nudges + polish + demo script.

### 12.4 Demo script (90 seconds)
Open map → walk into the glowing demo zone → commit "20 min off phone" → lock phone → dashboard's Quiet Index climbs live → unlock to show coach's gentle nudge → check out → reward lands in wallet → reveal the Claude-generated operator digest.

---

## 13. Real-World Value & Practical Applications

| Setting | Application | Value created |
|---|---|---|
| **Independent café** | "Quiet focus hours," certified | New differentiator, repeat focus-customers, premium positioning |
| **University library / study hall** | Department-run zones, exam-season push | Measurable proof that quiet initiatives work; student wellbeing |
| **Co-working space** | "Deep work rooms" with verified quietness | Membership perk; tenant satisfaction metric |
| **Corporate office** | Focus zones, meeting-free quiet areas | Wellbeing/productivity program with privacy-safe evidence |
| **Mental-health / digital-wellbeing programs** | Structured, social-cost-free disconnection | Ethical, consented behavioural support |

### 13.1 Why it's defensible
- **The metric is the moat:** the Quiet Index is a new, ownable standard. First mover defines it.
- **Two-sided network:** more zones → more useful map for users → more users → more reason for venues to join.
- **Privacy as positioning:** in a surveillance-weary market, "we measure your silence without watching you" is a genuine differentiator.

---

## 14. Scoring Self-Assessment (judging criteria)

| Criterion | Weight | How Hush scores |
|---|---|---|
| **Creativity** | 30% | A new, ownable metric (Quiet Index) that makes *absence* visible and valuable; the never-shaming coach is a fresh take on behavioural AI. |
| **Innovativeness** | 25% | Privacy-by-construction architecture; collective-disconnection-as-norm; a complete, zero-hardware software solution any venue can adopt instantly. |
| **Feasibility** | 20% | Pragmatic stack (Supabase + RN + FastAPI + Claude); Android-first with honest limits; a concrete MVP cut line; security designed-in (RLS, parameterized queries, server-side authz — §11). |
| **Interest Factor** | 10% | A map of glowing quiet zones and a phone that rewards you for ignoring it is genuinely fun to demo. |
| **Usefulness** | 15% | Solves a real, named pain for two user groups; immediate venue applications. |

---

## 15. Open Questions / Risks

| # | Item | Mitigation |
|---|---|---|
| R1 | iOS detection is limited | Android-first MVP; documented; honor-system + Focus-mode fallback |
| R2 | Gaming the score (leave phone, walk away) | Continuous geofence presence check + periodic lightweight presence confirmation (tap-to-stay-checked-in) + minimum session interaction |
| R3 | Cold-start (empty zones) | Operator-seeded events ("silent hours"); single-user "solo quiet" mode still rewards |
| R4 | Reward economics for venues | Operator sets point cost; low marginal cost rewards (free refill); analytics prove ROI |
| R5 | Battery / permission friction | OS-broadcast sampling; transparent permission onboarding |
| R6 | Reward farming / fake scores | Server-side score validation, rate limiting (SR-1), quorum enforcement (SR-10), per-user redeem limits — see §11 |
| R7 | Data breach / leakage | Privacy-by-construction (only 0–100 leaves device), RLS, no client secrets, encrypted transport — see §11 |

---

## 16. Glossary

- **Quiet Index** — live `0–100` zone score of collective digital disconnection.
- **Silence score** — per-user `0–100` on-device measure; the only personal value transmitted.
- **Zone** — an operator-defined geofenced area with a silence contract and rewards.
- **Silence contract** — the commitment terms of a zone (target minutes, threshold for rewards).
- **Quorum** — minimum active users before a zone's Quiet Index is published (privacy guard).

---

*End of PRD v1 — ready for your review. Mark up anything and I'll revise, then we can turn this into an implementation plan.*
