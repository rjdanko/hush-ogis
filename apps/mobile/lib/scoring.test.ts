import { describe, expect, it } from "vitest";
import { computeSilenceScore, type SilenceSignals } from "./scoring";

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
