import { describe, expect, it } from "vitest";
import { closeRing, MAX_POLYGON_VERTICES, validatePolygonRing } from "../lib/geo";

describe("closeRing", () => {
  it("appends the first point to close an open ring", () => {
    const ring: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(closeRing(ring)).toEqual([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]);
  });

  it("leaves an already-closed ring unchanged", () => {
    const ring: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
    expect(closeRing(ring)).toEqual(ring);
  });
});

describe("validatePolygonRing", () => {
  const validRing: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];

  it("accepts a valid closed ring with at least 4 points", () => {
    expect(validatePolygonRing(validRing)).toEqual({ ok: true });
  });

  it("rejects a ring with fewer than 4 points", () => {
    const result = validatePolygonRing([[0, 0], [0, 1], [0, 0]]);
    expect(result).toEqual({ ok: false, reason: "A polygon needs at least 3 distinct vertices." });
  });

  it("rejects a ring that isn't closed", () => {
    const result = validatePolygonRing([[0, 0], [0, 1], [1, 1], [1, 0]]);
    expect(result).toEqual({ ok: false, reason: "Polygon ring must be closed (first point must equal last point)." });
  });

  it(`rejects a ring with more than ${MAX_POLYGON_VERTICES} vertices`, () => {
    const tooMany: [number, number][] = Array.from({ length: MAX_POLYGON_VERTICES }, (_, i) => [i, 0]);
    tooMany.push(tooMany[0]!);
    const result = validatePolygonRing(tooMany);
    expect(result).toEqual({ ok: false, reason: `Polygon exceeds the ${MAX_POLYGON_VERTICES}-vertex cap.` });
  });

  it("rejects out-of-range longitude", () => {
    const result = validatePolygonRing([[200, 0], [0, 1], [1, 1], [200, 0]]);
    expect(result).toEqual({ ok: false, reason: "Longitude must be between -180 and 180." });
  });

  it("rejects out-of-range latitude", () => {
    const result = validatePolygonRing([[0, 95], [0, 1], [1, 1], [0, 95]]);
    expect(result).toEqual({ ok: false, reason: "Latitude must be between -90 and 90." });
  });

  it("rejects a NaN coordinate in an interior vertex", () => {
    const result = validatePolygonRing([[0, 0], [NaN, 1], [1, 1], [0, 0]]);
    expect(result).toEqual({ ok: false, reason: "Coordinates must be finite numbers." });
  });
});
