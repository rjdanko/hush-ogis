import { describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function selectChain(data: unknown, error: unknown = null) {
  return { select: () => Promise.resolve({ data, error }) };
}

describe("getWalletBalance", () => {
  it("sums the delta of the caller's own ledger entries", async () => {
    fromMock.mockReturnValueOnce(selectChain([{ delta: 50 }, { delta: -20 }, { delta: 5 }]));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).resolves.toBe(35);
    expect(fromMock).toHaveBeenCalledWith("wallet_ledger");
  });

  it("returns 0 when the ledger is empty", async () => {
    fromMock.mockReturnValueOnce(selectChain([]));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).resolves.toBe(0);
  });

  it("throws when the read fails", async () => {
    fromMock.mockReturnValueOnce(selectChain(null, { message: "network error" }));
    const { getWalletBalance } = await import("./wallet");
    await expect(getWalletBalance()).rejects.toThrow("network error");
  });
});

describe("listRewards", () => {
  it("maps reward rows to the Reward shape", async () => {
    fromMock.mockReturnValueOnce(
      selectChain([{ id: "r1", zone_id: "z1", name: "Free coffee", points_cost: 50, created_at: "2026-01-01T00:00:00Z" }])
    );
    const { listRewards } = await import("./wallet");
    await expect(listRewards()).resolves.toEqual([
      { id: "r1", zoneId: "z1", name: "Free coffee", pointsCost: 50, createdAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("rewards");
  });
});

describe("redeemReward", () => {
  it("calls the redeem_reward RPC with the reward id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: "rd1", user_id: "u1", reward_id: "r1", zone_id: "z1", points_spent: 50, created_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const { redeemReward } = await import("./wallet");
    await expect(redeemReward("r1")).resolves.toEqual({
      id: "rd1",
      userId: "u1",
      rewardId: "r1",
      zoneId: "z1",
      pointsSpent: 50,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(rpcMock).toHaveBeenCalledWith("redeem_reward", { p_reward_id: "r1" });
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "insufficient balance" } });
    const { redeemReward } = await import("./wallet");
    await expect(redeemReward("r1")).rejects.toThrow("insufficient balance");
  });
});

describe("getSessionPointsAwarded", () => {
  it("sums quiet_minute_accrual ledger entries tagged with this session", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [{ delta: 5 }], error: null }),
        }),
      }),
    });
    const { getSessionPointsAwarded } = await import("./wallet");
    await expect(getSessionPointsAwarded("s1")).resolves.toBe(5);
  });

  it("returns 0 when no accrual has landed yet for this session", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });
    const { getSessionPointsAwarded } = await import("./wallet");
    await expect(getSessionPointsAwarded("s1")).resolves.toBe(0);
  });
});
