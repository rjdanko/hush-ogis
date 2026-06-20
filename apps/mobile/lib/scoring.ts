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

// Exponential smoothing toward `target`, snapping to `target` once the
// remaining gap would round-trip forever without ever reaching it exactly
// (e.g. Math.round(1 * 0.6) = 1, an infinite floor just above 0). Shared by
// both the foreground-override branch and the normal path so the
// rounding-floor fix only has to live in one place.
function smoothToward(previous: number, target: number, alpha: number): number {
  const smoothed = previous + alpha * (target - previous);
  if (Math.abs(smoothed - target) < 1) return target;
  return Math.round(clamp(smoothed, 0, 100));
}

export function computeSilenceScore(signals: SilenceSignals, previousScore: number | null): number {
  if (signals.isForeground) {
    // Actively looking at any app overrides every other signal -- this is
    // the opposite of silence, regardless of recent screen-off history.
    if (previousScore === null) return 0;
    return smoothToward(previousScore, 0, SMOOTHING_ALPHA);
  }

  const screenOffScore = clamp(signals.screenOffMs / SCREEN_OFF_SATURATION_MS, 0, 1) * 100;
  const filterScore = interruptionFilterScore(signals.interruptionFilter);
  const raw = clamp(screenOffScore * SCREEN_OFF_WEIGHT + filterScore * INTERRUPTION_FILTER_WEIGHT, 0, 100);

  if (previousScore === null) return Math.round(raw);

  return smoothToward(previousScore, raw, SMOOTHING_ALPHA);
}
