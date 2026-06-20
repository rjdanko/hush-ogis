// Pure function: raw device signals -> a smoothed 0-100 silence score. No
// network, no native calls -- this is the most testable unit in Phase 4 and
// is fixture-tested hard (PRD §7.1, Implementation Plan Phase 4).
export interface SilenceSignals {
  screenOffMs: number;
  // Android NotificationManager.getCurrentInterruptionFilter() constants:
  // 1 = ALL, 2 = PRIORITY, 3 = NONE, 4 = ALARMS.
  interruptionFilter: number;
  isForeground: boolean;
}

const SCREEN_OFF_SATURATION_MS = 5 * 60_000;
const SCREEN_OFF_WEIGHT = 0.6;
const INTERRUPTION_FILTER_WEIGHT = 0.4;
const SMOOTHING_ALPHA = 0.4; // new-score weight in the exponential blend

function interruptionFilterScore(filter: number): number {
  // ALL (1) contributes nothing; PRIORITY/NONE/ALARMS (2-4) step up.
  switch (filter) {
    case 4:
      return 100;
    case 3:
      return 75;
    case 2:
      return 50;
    default:
      return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeSilenceScore(signals: SilenceSignals, previousScore: number | null): number {
  if (signals.isForeground) {
    // Actively looking at any app overrides every other signal -- this is
    // the opposite of silence, regardless of recent screen-off history.
    // Decay toward a target raw score of 0 using the same smoothing formula
    // as the normal path. A pure exponential decay rounds to a floor of 1
    // forever (e.g. Math.round(1 * 0.6) = 1), so snap small remainders to 0
    // explicitly to guarantee convergence in finite ticks.
    if (previousScore === null) return 0;
    const smoothed = previousScore + SMOOTHING_ALPHA * (0 - previousScore);
    return smoothed < 1 ? 0 : Math.round(clamp(smoothed, 0, 100));
  }

  const screenOffScore = clamp(signals.screenOffMs / SCREEN_OFF_SATURATION_MS, 0, 1) * 100;
  const filterScore = interruptionFilterScore(signals.interruptionFilter);
  const raw = clamp(screenOffScore * SCREEN_OFF_WEIGHT + filterScore * INTERRUPTION_FILTER_WEIGHT, 0, 100);

  if (previousScore === null) return Math.round(raw);

  const smoothed = previousScore + SMOOTHING_ALPHA * (raw - previousScore);
  return Math.round(clamp(smoothed, 0, 100));
}
