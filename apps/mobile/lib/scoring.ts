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

// Below this, a session has essentially no quiet-time signal: it either
// checked out almost immediately or recorded too few pings for
// compute_eligible_quiet_minutes (0019_session_points_accrual.sql) to ever
// see a qualifying gap. 2 minutes is roughly 8x the mobile client's 15s ping
// interval -- enough room that a session this short is "too short," not
// "unlucky," and the honest fix is to stay checked in longer.
const TOO_SHORT_MINUTES_THRESHOLD = 2;

// Zero points can mean two structurally different things (see
// compute_eligible_quiet_minutes): the session never ran long enough to
// produce eligible quiet minutes, or it ran long enough but the average
// score never cleared the zone's quiet threshold. Telling the first group to
// "stay longer" is correct; telling the second group the same thing is
// actively wrong advice -- they need to be quieter, not longer. When neither
// field carries a usable signal (e.g. zero pings at all), fall back to the
// original generic message.
//
// `minScoreForEarning` is the zone's real eligibility threshold
// (zones.reward_config.min_score_for_earning, default 100 -- see
// 0019_session_points_accrual.sql), threaded in from the Zone the session
// belongs to. The comparison polarity below (finalScore < minScoreForEarning)
// deliberately mirrors compute_eligible_quiet_minutes's own
// `score >= p_min_score` eligibility check, just inverted, so the client's
// message never disagrees with the server's actual accrual decision.
export function sessionSummaryHint(
  pointsAwarded: number,
  achievedMinutes: number | null,
  finalScore: number | null,
  minScoreForEarning: number
): string {
  if (pointsAwarded > 0) return "Your wallet has been credited.";

  // Both fields missing means there's no signal at all (e.g. zero pings
  // recorded) -- not enough to differentiate "too short" from "too noisy,"
  // so fall back to the original generic message rather than guessing.
  if (achievedMinutes == null && finalScore == null) {
    return "No points this time -- stay quietly checked in longer to earn some.";
  }

  if (achievedMinutes == null || achievedMinutes < TOO_SHORT_MINUTES_THRESHOLD) {
    return "Not enough quiet time recorded yet -- stay checked in a little longer.";
  }

  if (finalScore != null && finalScore < minScoreForEarning) {
    return "This session was a bit too lively to earn points this time -- a quieter stretch next time should do it.";
  }

  return "No points this time -- stay quietly checked in longer to earn some.";
}
