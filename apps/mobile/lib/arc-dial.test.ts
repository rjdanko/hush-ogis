import { describe, expect, it } from "vitest";
import {
  ARC_START_ANGLE,
  ARC_SWEEP,
  DIAL_MIN,
  DIAL_MAX,
  DIAL_STEP,
  valueToAngle,
  angleToValue,
  polarToXY,
  describeArc,
  xyToAngle,
} from "./arc-dial";

describe("valueToAngle", () => {
  it("maps min value to start angle", () => {
    expect(valueToAngle(DIAL_MIN)).toBe(ARC_START_ANGLE);
  });

  it("maps max value to start + sweep", () => {
    expect(valueToAngle(DIAL_MAX)).toBeCloseTo(ARC_START_ANGLE + ARC_SWEEP);
  });

  it("maps midpoint value to start + half sweep", () => {
    const mid = (DIAL_MIN + DIAL_MAX) / 2; // 62.5
    expect(valueToAngle(mid)).toBeCloseTo(ARC_START_ANGLE + ARC_SWEEP / 2);
  });
});

describe("angleToValue", () => {
  it("maps start angle to min value", () => {
    expect(angleToValue(ARC_START_ANGLE)).toBe(DIAL_MIN);
  });

  it("maps start + sweep to max value", () => {
    expect(angleToValue(ARC_START_ANGLE + ARC_SWEEP)).toBe(DIAL_MAX);
  });

  it("snaps to nearest step", () => {
    // Angle for value 12 — should snap to 10 (nearest multiple of 5)
    const angleFor12 = valueToAngle(12);
    expect(angleToValue(angleFor12)).toBe(10);
  });

  it("clamps angle below arc start to min", () => {
    expect(angleToValue(ARC_START_ANGLE - 30)).toBe(DIAL_MIN);
  });

  it("clamps angle beyond arc end to max", () => {
    expect(angleToValue(ARC_START_ANGLE + ARC_SWEEP + 30)).toBe(DIAL_MAX);
  });
});

describe("polarToXY", () => {
  it("returns top center for 0° (12 o'clock)", () => {
    const { x, y } = polarToXY(100, 100, 50, 0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(50);
  });

  it("returns right center for 90° (3 o'clock)", () => {
    const { x, y } = polarToXY(100, 100, 50, 90);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(100);
  });
});

describe("describeArc", () => {
  it("returns an SVG path string", () => {
    const path = describeArc(100, 100, 50, ARC_START_ANGLE, ARC_START_ANGLE + ARC_SWEEP);
    expect(path).toMatch(/^M .+ A .+/);
  });

  it("uses large-arc flag 1 for sweep > 180°", () => {
    const path = describeArc(100, 100, 50, ARC_START_ANGLE, ARC_START_ANGLE + ARC_SWEEP);
    expect(path).toContain(" 1 1 ");
  });
});

describe("xyToAngle", () => {
  it("returns 0° for 12 o'clock (up)", () => {
    expect(xyToAngle(0, -1)).toBeCloseTo(0);
  });
  it("returns 90° for 3 o'clock (right)", () => {
    expect(xyToAngle(1, 0)).toBeCloseTo(90);
  });
  it("returns 180° for 6 o'clock (down)", () => {
    expect(xyToAngle(0, 1)).toBeCloseTo(180);
  });
  it("returns 270° for 9 o'clock (left)", () => {
    expect(xyToAngle(-1, 0)).toBeCloseTo(270);
  });
  it("never returns a negative angle", () => {
    expect(xyToAngle(-1, -0.001)).toBeGreaterThanOrEqual(0);
  });
});
