import { describe, expect, it } from "vitest";
import { computeSilenceScore, sessionSummaryHint, type SilenceSignals } from "./scoring";

function signals(overrides: Partial<SilenceSignals> = {}): SilenceSignals {
  return {
    screenOffMs: 0,
    interruptionFilter: 1, // ALL -- no DND
    isForeground: false,
    ...overrides,
  };
}

describe("computeSilenceScore", () => {
  it("scores 0 when the screen just turned on and there is no prior score", () => {
    expect(computeSilenceScore(signals({ screenOffMs: 0 }), null)).toBe(0);
  });

  it("scores 100 when the screen has been off for 5+ minutes with DND on full alarms-only", () => {
    expect(
      computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), null)
    ).toBe(100);
  });

  it("scores partially for a screen-off duration under the 5-minute saturation point", () => {
    const score = computeSilenceScore(signals({ screenOffMs: 60_000 }), null);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(50);
  });

  it("forces a low score whenever any app is in the foreground, even with a long screen-off duration", () => {
    const score = computeSilenceScore(
      signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4, isForeground: true }),
      null
    );
    expect(score).toBeLessThanOrEqual(20);
  });

  it("smooths toward the new raw score rather than jumping instantly", () => {
    const raw = computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), null);
    const smoothed = computeSilenceScore(signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4 }), 0);
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(raw);
  });

  it("clamps to [0, 100]", () => {
    const score = computeSilenceScore(signals({ screenOffMs: 1_000_000_000 }), 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("decays to exactly 0 within a reasonable number of ticks when the app stays in the foreground", () => {
    let score: number | null = 90;
    const foregroundSignals = signals({ screenOffMs: 5 * 60_000, interruptionFilter: 4, isForeground: true });
    let reachedZero = false;
    for (let i = 0; i < 20; i++) {
      score = computeSilenceScore(foregroundSignals, score);
      if (score === 0) {
        reachedZero = true;
        break;
      }
    }
    expect(reachedZero).toBe(true);
    expect(score).toBe(0);
  });

  it("decays to exactly 0 within a reasonable number of ticks via the normal (non-foreground) path", () => {
    let score: number | null = 90;
    const noSilenceSignals = signals({ screenOffMs: 0, interruptionFilter: 1, isForeground: false });
    let reachedZero = false;
    for (let i = 0; i < 20; i++) {
      score = computeSilenceScore(noSilenceSignals, score);
      if (score === 0) {
        reachedZero = true;
        break;
      }
    }
    expect(reachedZero).toBe(true);
    expect(score).toBe(0);
  });

  it("scores reflect the PRIORITY interruption filter (2) distinctly from NONE (3) and ALARMS (4)", () => {
    const priorityScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 2 }), null);
    const noneScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 3 }), null);
    const alarmsScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 4 }), null);

    // interruptionFilterScore(2) = 50 -> raw = 50 * 0.4 = 20
    expect(priorityScore).toBe(20);
    expect(priorityScore).toBeLessThan(noneScore);
    expect(priorityScore).toBeLessThan(alarmsScore);
  });

  it("scores reflect the NONE interruption filter (3) distinctly from PRIORITY (2) and ALARMS (4)", () => {
    const priorityScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 2 }), null);
    const noneScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 3 }), null);
    const alarmsScore = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 4 }), null);

    // interruptionFilterScore(3) = 75 -> raw = 75 * 0.4 = 30
    expect(noneScore).toBe(30);
    expect(noneScore).toBeGreaterThan(priorityScore);
    expect(noneScore).toBeLessThan(alarmsScore);
  });

  it("smooths toward a lower raw score gradually rather than jumping straight down", () => {
    const previousScore = 90;
    const rawNow = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 1 }), null);
    const smoothed = computeSilenceScore(signals({ screenOffMs: 0, interruptionFilter: 1 }), previousScore);

    expect(rawNow).toBe(0);
    expect(smoothed).toBeLessThan(previousScore);
    expect(smoothed).toBeGreaterThan(rawNow);
  });
});

describe("sessionSummaryHint", () => {
  const TOO_NOISY_MESSAGE =
    "This session was a bit too lively to earn points this time -- a quieter stretch next time should do it.";

  it("credits the wallet when points were awarded, regardless of minutes/score", () => {
    expect(sessionSummaryHint(5, 1, 10, 50)).toBe("Your wallet has been credited.");
    expect(sessionSummaryHint(1, null, null, 50)).toBe("Your wallet has been credited.");
  });

  it("falls back to the generic no-signal message when there's nothing to differentiate on", () => {
    expect(sessionSummaryHint(0, null, null, 50)).toBe(
      "No points this time -- stay quietly checked in longer to earn some."
    );
  });

  it("names the too-short / not-enough-signal cause when achievedMinutes is null", () => {
    expect(sessionSummaryHint(0, null, 80, 50)).toBe(
      "Not enough quiet time recorded yet -- stay checked in a little longer."
    );
  });

  it("names the too-short / not-enough-signal cause when achievedMinutes is under the threshold", () => {
    expect(sessionSummaryHint(0, 1, 80, 50)).toBe(
      "Not enough quiet time recorded yet -- stay checked in a little longer."
    );
    expect(sessionSummaryHint(0, 1.9, null, 50)).toBe(
      "Not enough quiet time recorded yet -- stay checked in a little longer."
    );
  });

  it("names the too-noisy cause when the session ran long enough but the score stayed low", () => {
    expect(sessionSummaryHint(0, 10, 30, 50)).toBe(TOO_NOISY_MESSAGE);
  });

  it("treats the too-short threshold as exclusive at exactly 2 minutes (long enough to check the score instead)", () => {
    expect(sessionSummaryHint(0, 2, 30, 50)).toBe(TOO_NOISY_MESSAGE);
  });

  it("falls back to the generic message when minutes are long enough but score is also missing", () => {
    expect(sessionSummaryHint(0, 10, null, 50)).toBe(
      "No points this time -- stay quietly checked in longer to earn some."
    );
  });

  it("uses the real per-zone threshold rather than a fixed guess -- a score of 60 is below the zone's default 100 threshold", () => {
    // Regression test: the old implementation hardcoded a 50-point
    // threshold, so a score of 60 (>= 50) fell through to the generic
    // fallback even though it's well below the zone's actual default
    // min_score_for_earning of 100 (0019_session_points_accrual.sql).
    expect(sessionSummaryHint(0, 10, 60, 100)).toBe(TOO_NOISY_MESSAGE);
  });

  it("does not call it too-noisy when the score is exactly at the zone's threshold, matching the server's >= eligibility", () => {
    // compute_eligible_quiet_minutes treats score >= p_min_score as
    // eligible, so a score exactly at the threshold is NOT "too noisy."
    expect(sessionSummaryHint(0, 10, 100, 100)).toBe(
      "No points this time -- stay quietly checked in longer to earn some."
    );
  });

  it("calls it too-noisy when the score is one point below the zone's threshold", () => {
    expect(sessionSummaryHint(0, 10, 99, 100)).toBe(TOO_NOISY_MESSAGE);
  });
});
