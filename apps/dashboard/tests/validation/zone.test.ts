import { describe, expect, it } from "vitest";
import { zoneCreateSchema, zoneUpdateSchema } from "../../lib/validation/zone";

const validPolygon = {
  type: "Polygon" as const,
  coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] as [number, number][][],
};

describe("zoneCreateSchema", () => {
  it("accepts a valid zone payload", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: { suggested_minutes: 45 },
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70, daily_point_cap: 120 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = zoneCreateSchema.safeParse({
      name: "",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a polygon that isn't closed", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]] },
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects min_score_for_earning outside 0-100", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 150 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (strict schema, mirrors PRD ingest-endpoint posture)", () => {
    const result = zoneCreateSchema.safeParse({
      name: "Demo Cafe",
      geofence: validPolygon,
      silenceContract: {},
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      operatorId: "00000000-0000-0000-0000-000000000099",
    });
    expect(result.success).toBe(false);
  });
});

describe("zoneUpdateSchema", () => {
  it("accepts a partial update (name only)", () => {
    const result = zoneUpdateSchema.safeParse({ name: "Renamed Cafe" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = zoneUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
