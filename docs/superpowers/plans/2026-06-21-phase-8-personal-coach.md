# Phase 8 — Personal Disconnection Coach (U5, on-device) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. This is a TDD phase — the rule engine and message library are pure units; test them hard with fixtures, exactly like `lib/scoring.ts`. On execution, copy this plan to `docs/superpowers/plans/2026-06-21-phase-8-personal-coach.md` to match repo convention.

## Context

Phase 8 adds the **Personal Disconnection Coach** — the PRD's "AI hero feature" (U5, §8.1). It is a private, **never-shaming**, **100% on-device** companion that watches the live local signals already produced in Phase 4 and surfaces gentle, dismissible nudge cards during an active session ("you're past your goal — stay as long as feels good", a soft note when the phone is picked up, etc.).

Why now: the in-zone hero screen ([apps/mobile/screens/ActiveSessionScreen.tsx](../../Downloads/PERSONAL%20PROJECTS/OGIS/apps/mobile/screens/ActiveSessionScreen.tsx)) already runs a 15s loop that fetches `getSilenceSignals()` → `computeSilenceScore()`. That loop is the perfect, already-private place to evaluate coach rules — no new native bridge, no new data, nothing leaves the phone. The session today shows only a score orb and a checkout button; the coach makes the experience feel personal and supportive without becoming a notification engine.

**Hard privacy boundary (PRD §8.1, §7.3, Implementation Plan Phase 8 security gate):** the coach runs on local signals **only** — behavioural data never leaves the phone. The rule engine is a pure function with **no network imports**, and we assert no network egress as the phase's security gate.

**Decisions locked with user (2026-06-21):**
- **Scope = live-signal nudges only.** React to the *current* session's signals. No cross-session baseline learning / adaptive goals ("you usually manage 30 min here") — that requires on-device history persistence and is deferred to V1, consistent with the "🟢 MVP (lite)" tag.
- **Point-related nudges = quiet-time feedback, no number.** The device never knows server-awarded points (Phase 6 accrual is server-verified). Nudges celebrate accumulating quiet time ("your quiet time is adding up") and never show a points figure — honest, and avoids implying the client mints points.

**Tone is a hard requirement, not flavour (PRD §8.1):** encouraging, calm; **never** guilt-trips for picking the phone up. The coach respects the *freedom to reconnect*. We enforce this programmatically with a shaming-word denylist test over the message library.

---

## Architecture & data flow

```
ActiveSessionScreen 15s tick (already on-device, already private)
  ├─ getSilenceSignals(elapsed)         (Phase 4, lib/signals.ts)
  ├─ computeSilenceScore(signals, prev) (Phase 4, lib/scoring.ts)
  └─ NEW: evaluateCoach(state, memory, now)   (Phase 8, lib/coach.ts — PURE)
            ├─ state  = { liveScore, previousScore, isForeground, elapsedMs,
            │             intendedMinutes, recentScores[] }
            ├─ memory = { lastNudgeAt, firedOneShots[] }  (kept in a useRef)
            └─ returns { nudge: {category,message} | null, memory }
                 └─ pickMessage(category, memory)  (lib/coach-messages.ts — curated, deterministic)
                      └─ setCoachNudge(...) → <CoachCard/> renders (soft, dismissible)
                                              NOTHING is transmitted
```

The engine is decision-only and pure (mirrors `computeSilenceScore`'s `(signals, previousScore)` shape): it takes the prior `memory` and returns the next `memory`, so cooldowns / one-shot tracking stay testable without side effects. The screen owns the `useRef` that carries `memory` across ticks.

---

## New / changed files

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/lib/coach.ts` | create | Pure rule engine + types (`CoachSignalState`, `CoachMemory`, `CoachNudgeCategory`, `evaluateCoach`). |
| `apps/mobile/lib/coach.test.ts` | create | Fixture-driven unit tests: state X → category Y, cooldown, one-shot, no-trigger. |
| `apps/mobile/lib/coach-messages.ts` | create | Curated message library keyed to category; deterministic `pickMessage`. |
| `apps/mobile/lib/coach-messages.test.ts` | create | Every category has a message; never-shaming denylist; no-network assertion. |
| `apps/mobile/components/CoachCard.tsx` | create | "Anti-notification" soft, dismissible nudge card (Design Brief §6). New `components/` dir. |
| `apps/mobile/screens/ActiveSessionScreen.tsx` | edit | Wire `evaluateCoach` into the existing tick loop; render `CoachCard`; reduced-motion aware. |

No backend, migration, shared-type, dashboard, or ai-service changes — this phase is entirely on-device.

---

### Task 1: Coach rule engine (pure, TDD) — `lib/coach.ts`

Mirror the structure and discipline of [lib/scoring.ts](../../Downloads/PERSONAL%20PROJECTS/OGIS/apps/mobile/lib/scoring.ts): a pure function, no imports of `react-native`, `./ingest`, `./supabase`, or anything network-bearing.

**Types:**
```ts
export type CoachNudgeCategory =
  | "settling"            // early in session, gentle welcome (one-shot)
  | "phone_picked_up"     // isForeground this tick — soft, never scolding
  | "streak_improving"    // recentScores trending up & currently high
  | "quiet_accumulating"  // sustained high score — "your quiet time is adding up"
  | "goal_nearing"        // elapsed >= ~80% of intendedMinutes (one-shot)
  | "goal_reached";       // elapsed >= intendedMinutes (one-shot)

export interface CoachSignalState {
  liveScore: number;            // current smoothed 0–100 silence score
  previousScore: number | null; // prior tick's score (trend / drop detection)
  isForeground: boolean;        // phone actively in use this tick
  elapsedMs: number;
  intendedMinutes: number | null;
  recentScores: number[];       // last N scores for trend detection
}

export interface CoachMemory {
  lastNudgeAt: number | null;          // ms epoch of last shown nudge
  firedOneShots: CoachNudgeCategory[]; // categories that fire at most once/session
}

export function evaluateCoach(
  state: CoachSignalState,
  memory: CoachMemory,
  now: number,
): { nudge: { category: CoachNudgeCategory } | null; memory: CoachMemory };
```

**Behaviour (priority order; first match wins):** `goal_reached` → `phone_picked_up` → `goal_nearing` → `streak_improving` → `quiet_accumulating` → `settling`. Constants near the top like scoring.ts:
- `NUDGE_COOLDOWN_MS = 45_000` — global min gap so cards never spam (returns `null` if `now - lastNudgeAt < cooldown`, except a fresh higher-priority one-shot may still fire — keep the rule simple and explicit, and test it).
- `STREAK_LOOKBACK = 4`, `HIGH_SCORE = 70` (reuse the same "quiet" threshold the glow scale uses), `GOAL_NEAR_FRACTION = 0.8`.
- One-shots (`settling`, `goal_nearing`, `goal_reached`) fire once per session — tracked in `firedOneShots`.
- `phone_picked_up` triggers on `isForeground === true` (optionally also a sharp `liveScore` drop from a prior high) but respects cooldown so it never nags.

- [ ] **Step 1 (RED):** Write `lib/coach.test.ts` first with a `state(overrides)` fixture builder (copy the helper style from [lib/scoring.test.ts](../../Downloads/PERSONAL%20PROJECTS/OGIS/apps/mobile/lib/scoring.test.ts)). Assert at minimum:
  - foreground tick → `phone_picked_up`.
  - `elapsed >= intendedMinutes` → `goal_reached`, and it does **not** fire twice (one-shot via returned memory).
  - `elapsed` in [80%,100%) of intended → `goal_nearing` (and not after `goal_reached`).
  - rising `recentScores` ending high → `streak_improving`.
  - sustained high score, no other trigger → `quiet_accumulating`.
  - within `NUDGE_COOLDOWN_MS` of `lastNudgeAt` → `null` for non-one-shot triggers.
  - calm baseline (mid score, not foreground, no goal) → `null`.
  - `intendedMinutes === null` → goal categories never fire.
- [ ] **Step 2 (GREEN):** Implement `evaluateCoach`. Pure, deterministic, no `Date.now()` inside (caller passes `now`). Return updated `memory` (set `lastNudgeAt`, append to `firedOneShots`) whenever a nudge is returned; otherwise return `memory` unchanged.
- [ ] **Step 3 (REFACTOR):** Factor priority checks into small named predicates; keep constants documented like scoring.ts.

### Task 2: Message library (curated, never-shaming) — `lib/coach-messages.ts`

- [ ] **Step 1 (RED):** Write `lib/coach-messages.test.ts`:
  - every `CoachNudgeCategory` resolves to a non-empty message via `pickMessage`.
  - **never-shaming gate:** no message matches a denylist regex (`/\b(fail|failed|should(n.t)?|wasted|guilt|again\?|don.t|stop|bad)\b/i`) — this is the programmatic enforcement of PRD §8.1 tone.
  - **no-network gate (security):** assert the module source imports nothing network-bearing — e.g. read the file and assert it contains no `fetch`/`supabase`/`./ingest` references (or structure the test as importing the module and asserting it exports only pure data/functions). Do the same assertion for `coach.ts`.
  - point-framing gate: messages for `quiet_accumulating` contain no digit/points wording (honour the "no number" decision).
- [ ] **Step 2 (GREEN):** Implement `MESSAGES: Record<CoachNudgeCategory, string[]>` with 2–3 warm variants each, and `pickMessage(category, memory): string` choosing deterministically (e.g. index by `firedOneShots.length % variants.length`) so tests are stable. Example tone:
  - `goal_reached`: "You're past your goal. Stay as long as it feels good."
  - `phone_picked_up`: "Welcome back. The quiet's still here whenever you are."
  - `quiet_accumulating`: "Your quiet time is adding up. Nicely done."
  - `goal_nearing`: "Almost at your goal — and no rush."
  - `streak_improving`: "Settling deeper. This is the good part."
  - `settling`: "Phone down. Take a breath."

### Task 3: Coach card UI ("anti-notification") — `components/CoachCard.tsx`

Soft, dismissible, low-urgency card per Design Brief §6 ("Coach card" / "the opposite of a notification"). Reuse [lib/theme.ts](../../Downloads/PERSONAL%20PROJECTS/OGIS/apps/mobile/lib/theme.ts) night palette — `colors.nightCard` surface, `colors.nightWarmText`, `colors.nightHint`, `fonts.body`. **No red, no count badge, no urgent styling.**

- [ ] Props: `{ message: string; onDismiss: () => void }`.
- [ ] Layout: rounded (`borderRadius: 16`) card matching the existing `styles.tile` look, gentle padding, a small dismiss affordance (tap-to-dismiss or a soft "×"). Positioned as a low overlay above the checkout button so it never blocks the orb (one focal point).
- [ ] Motion: a slow fade-in (reuse the `AccessibilityInfo.isReduceMotionEnabled()` pattern already in `ActiveSessionScreen`); under reduced-motion it appears statically — first-class state (Design Brief §8).
- [ ] Accessibility: `accessibilityRole`/label so the nudge is announced calmly; dismiss is reachable.

### Task 4: Wire the coach into the session loop — `screens/ActiveSessionScreen.tsx`

Integrate into the **existing** `tick()` in the effect at [ActiveSessionScreen.tsx:30-69](../../Downloads/PERSONAL%20PROJECTS/OGIS/apps/mobile/screens/ActiveSessionScreen.tsx#L30-L69) — do not add a second timer.

- [ ] Add refs: `coachMemory` (`useRef<CoachMemory>({ lastNudgeAt: null, firedOneShots: [] })`) and `recentScores` (`useRef<number[]>([])`, pushed each tick, capped to `STREAK_LOOKBACK`).
- [ ] Add state: `const [coachNudge, setCoachNudge] = useState<string | null>(null)`.
- [ ] In `tick()`, after `setLiveScore(score)`: build `CoachSignalState` from the tick's `signals.isForeground`, `score`, prior `previousScore`, `elapsed`, `session.intendedMinutes`, and `recentScores.current`; call `evaluateCoach(state, coachMemory.current, Date.now())`; persist returned `memory`; if `nudge`, `setCoachNudge(pickMessage(nudge.category, memory))`.
- [ ] Render `{coachNudge && <CoachCard message={coachNudge} onDismiss={() => setCoachNudge(null)} />}`.
- [ ] Keep all existing behaviour (score orb, ping send, checkout) untouched; coach evaluation must not throw into the ingest path.

---

## Verification

- [ ] **Unit tests (primary gate):** `cd apps/mobile && npm test` — `coach.test.ts` and `coach-messages.test.ts` pass alongside existing `scoring`/`signals` suites. This is how the phase's "rule engine unit tests pass; nudges fire on the right local events" exit criterion is proven.
- [ ] **Tone gate:** the never-shaming denylist test is green (enforces PRD §8.1).
- [ ] **Security gate (no network egress):** the no-network assertions over `coach.ts` / `coach-messages.ts` pass; manually confirm `CoachCard.tsx` and the new `ActiveSessionScreen` wiring import nothing network-bearing — the coach reads only Phase 4 in-memory signals.
- [ ] **Manual on-device check (RN — no Playwright path for mobile):** run the app, check into the demo zone, set a short intention (e.g. 1 min), lock the phone briefly then pick it up → a gentle `phone_picked_up` card appears (not a scolding); let the intention elapse → a `goal_reached` card; confirm cards are dismissible and respect reduced-motion (toggle OS setting). Confirm via dev logs that no extra network calls fire from coach evaluation.
- [ ] **Audits (SR-14):** `npm audit` shows no new findings introduced by this phase (no new runtime deps expected — pure TS + existing RN primitives).

## Security gates (Implementation Plan Phase 8)

- **Privacy-by-construction:** assert **no network egress** from the coach (pure engine + library tests + manual import review). Behavioural data never leaves the phone.
- Tone reviewed against the never-shaming rule (denylist test + human read of the message library).
- Point-related messaging is calm feedback with **no points number** (test-enforced).

## Out of scope (deferred)

- Adaptive/baseline goal learning across sessions (V1) — needs on-device history persistence.
- On-device SLM for varied phrasing (V1, PRD §8.1).
- A settings toggle to disable the coach (Settings/privacy center is a later phase) — for MVP the coach is on by default and every card is dismissible.
