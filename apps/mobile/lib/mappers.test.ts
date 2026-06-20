import { describe, expect, it } from "vitest";
import { toZone, toSession, ZONE_SELECT } from "./mappers";

describe("ZONE_SELECT", () => {
  it("selects the geofence via the GeoJSON computed column", () => {
    expect(ZONE_SELECT).toContain("geofence:zones_geofence_geojson");
  });
});

describe("toZone", () => {
  it("maps a snake_case zone row to the camelCase Zone shape", () => {
    const row = {
      id: "z1",
      operator_id: "op1",
      name: "Demo Cafe",
      geofence: {
        type: "Polygon" as const,
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ] as [number, number][],
        ],
      },
      silence_contract: { suggested_minutes: 45 },
      reward_config: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(toZone(row)).toEqual({
      id: "z1",
      operatorId: "op1",
      name: "Demo Cafe",
      geofence: row.geofence,
      silenceContract: { suggested_minutes: 45 },
      rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toSession", () => {
  it("maps a snake_case session row to the camelCase Session shape", () => {
    const row = {
      id: "s1",
      user_id: "u1",
      zone_id: "z1",
      start_ts: "2026-01-01T00:00:00Z",
      end_ts: null,
      intended_minutes: 20,
      achieved_minutes: null,
      final_score: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(toSession(row)).toEqual({
      id: "s1",
      userId: "u1",
      zoneId: "z1",
      startTs: "2026-01-01T00:00:00Z",
      endTs: null,
      intendedMinutes: 20,
      achievedMinutes: null,
      finalScore: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});
