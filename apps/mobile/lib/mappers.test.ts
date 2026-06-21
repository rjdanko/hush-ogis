import { describe, expect, it } from "vitest";
import { toRedemption, toReward, toSession, toWalletLedgerEntry, toZone, ZONE_SELECT } from "./mappers";

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
      anon_token: "tok-abc",
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
      anonToken: "tok-abc",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("maps anon_token to anonToken", () => {
    const session = toSession({
      id: "s1",
      user_id: "u1",
      zone_id: "z1",
      start_ts: "2026-01-01T00:00:00Z",
      end_ts: null,
      intended_minutes: null,
      achieved_minutes: null,
      final_score: null,
      anon_token: "tok-123",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(session.anonToken).toBe("tok-123");
  });
});

describe("toReward", () => {
  it("maps snake_case DB columns to the Reward shape", () => {
    expect(
      toReward({
        id: "r1",
        zone_id: "z1",
        name: "Free coffee",
        points_cost: 50,
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "r1",
      zoneId: "z1",
      name: "Free coffee",
      pointsCost: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toWalletLedgerEntry", () => {
  it("maps snake_case DB columns to the WalletLedgerEntry shape", () => {
    expect(
      toWalletLedgerEntry({
        id: "w1",
        user_id: "u1",
        delta: 5,
        reason: "quiet_minute_accrual",
        metadata: { session_id: "s1" },
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "w1",
      userId: "u1",
      delta: 5,
      reason: "quiet_minute_accrual",
      metadata: { session_id: "s1" },
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("toRedemption", () => {
  it("maps snake_case DB columns to the Redemption shape", () => {
    expect(
      toRedemption({
        id: "rd1",
        user_id: "u1",
        reward_id: "r1",
        zone_id: "z1",
        points_spent: 50,
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      id: "rd1",
      userId: "u1",
      rewardId: "r1",
      zoneId: "z1",
      pointsSpent: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});
