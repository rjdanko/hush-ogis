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
});
