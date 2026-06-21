// Pure rule engine: silence-scoring signals (Phase 4) -> at most one coach
// nudge category per tick. No network, no native calls, no message text --
// this only decides *which* category should fire (PRD §8.1, U5). The caller
// (UI layer, not this file) maps the category to copy and renders it.
export type CoachNudgeCategory =
  | "settling" // early in session, gentle welcome (one-shot)
  | "phone_picked_up" // isForeground this tick -- soft, never scolding
  | "streak_improving" // recentScores trending up & currently high
  | "quiet_accumulating" // sustained high score -- "your quiet time is adding up"
  | "goal_nearing" // elapsed >= ~80% of intendedMinutes (one-shot)
  | "goal_reached"; // elapsed >= intendedMinutes (one-shot)

export interface CoachSignalState {
  liveScore: number; // current smoothed 0-100 silence score
  previousScore: number | null; // prior tick's score (trend / drop detection)
  isForeground: boolean; // phone actively in use this tick
  elapsedMs: number;
  intendedMinutes: number | null;
  recentScores: number[]; // last N scores for trend detection
}

export interface CoachMemory {
  lastNudgeAt: number | null; // ms epoch of last shown nudge
  firedOneShots: CoachNudgeCategory[]; // categories that fire at most once/session
}

export interface CoachEvaluation {
  nudge: { category: CoachNudgeCategory } | null;
  memory: CoachMemory;
}

const NUDGE_COOLDOWN_MS = 45_000; // global min gap so cards never spam
const STREAK_LOOKBACK = 4;
const HIGH_SCORE = 70; // same "quiet" threshold the glow scale uses -- see lib/glow.ts
const GOAL_NEAR_FRACTION = 0.8;
const SETTLING_WINDOW_MS = 30_000; // "early in session" window for the welcome nudge

const ONE_SHOT_CATEGORIES: ReadonlySet<CoachNudgeCategory> = new Set([
  "settling",
  "goal_nearing",
  "goal_reached",
]);

function hasFired(memory: CoachMemory, category: CoachNudgeCategory): boolean {
  return memory.firedOneShots.includes(category);
}

function goalFraction(state: CoachSignalState): number | null {
  if (state.intendedMinutes === null || state.intendedMinutes <= 0) return null;
  const intendedMs = state.intendedMinutes * 60_000;
  return state.elapsedMs / intendedMs;
}

function isGoalReached(state: CoachSignalState, memory: CoachMemory): boolean {
  if (hasFired(memory, "goal_reached")) return false;
  const fraction = goalFraction(state);
  return fraction !== null && fraction >= 1;
}

function isGoalNearing(state: CoachSignalState, memory: CoachMemory): boolean {
  if (hasFired(memory, "goal_nearing") || hasFired(memory, "goal_reached")) return false;
  const fraction = goalFraction(state);
  return fraction !== null && fraction >= GOAL_NEAR_FRACTION && fraction < 1;
}

function isPhonePickedUp(state: CoachSignalState): boolean {
  return state.isForeground;
}

function isStreakImproving(state: CoachSignalState): boolean {
  const recent = state.recentScores.slice(-STREAK_LOOKBACK);
  if (recent.length < 2) return false;
  if (recent[recent.length - 1] < HIGH_SCORE) return false;

  // Strictly non-decreasing across the lookback window, with at least one
  // real rise -- a flat-but-high run is "sustained", not "improving".
  let rose = false;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] < recent[i - 1]) return false;
    if (recent[i] > recent[i - 1]) rose = true;
  }
  return rose;
}

function isQuietAccumulating(state: CoachSignalState): boolean {
  const recent = state.recentScores.slice(-STREAK_LOOKBACK);
  if (recent.length === 0) return false;
  return recent.every((score) => score >= HIGH_SCORE);
}

function isSettling(state: CoachSignalState, memory: CoachMemory): boolean {
  if (hasFired(memory, "settling")) return false;
  return state.elapsedMs <= SETTLING_WINDOW_MS;
}

function withinCooldown(memory: CoachMemory, now: number): boolean {
  return memory.lastNudgeAt !== null && now - memory.lastNudgeAt < NUDGE_COOLDOWN_MS;
}

function recordNudge(
  memory: CoachMemory,
  category: CoachNudgeCategory,
  now: number
): CoachMemory {
  const firedOneShots = ONE_SHOT_CATEGORIES.has(category)
    ? [...memory.firedOneShots, category]
    : memory.firedOneShots;
  return { lastNudgeAt: now, firedOneShots };
}

export function evaluateCoach(
  state: CoachSignalState,
  memory: CoachMemory,
  now: number
): CoachEvaluation {
  // Priority order; first match wins. One-shots are allowed to fire even
  // inside the cooldown window (a fresh higher-priority milestone, e.g.
  // reaching the goal, should never be swallowed by a recent unrelated
  // nudge) -- everything else respects the global cooldown.
  const candidates: Array<[CoachNudgeCategory, boolean]> = [
    ["goal_reached", isGoalReached(state, memory)],
    ["phone_picked_up", isPhonePickedUp(state) && !withinCooldown(memory, now)],
    ["goal_nearing", isGoalNearing(state, memory)],
    ["streak_improving", isStreakImproving(state) && !withinCooldown(memory, now)],
    ["quiet_accumulating", isQuietAccumulating(state) && !withinCooldown(memory, now)],
    ["settling", isSettling(state, memory)],
  ];

  for (const [category, matches] of candidates) {
    if (matches) {
      return { nudge: { category }, memory: recordNudge(memory, category, now) };
    }
  }

  return { nudge: null, memory };
}

export { NUDGE_COOLDOWN_MS, STREAK_LOOKBACK, HIGH_SCORE, GOAL_NEAR_FRACTION, SETTLING_WINDOW_MS };
