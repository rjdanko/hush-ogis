import { describe, expect, it, vi } from "vitest";
import { bestSessionMinutes, computeStreak, getSessionHistory, totalQuietHours } from "./history";

function buildSelectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

vi.mock("./supabase", () => ({
  supabase: { from: vi.fn() },
}));

describe("getSessionHistory", () => {
  it("queries sessions by start_ts/end_ts and aggregates completed sessions per day", async () => {
    const { supabase } = await import("./supabase");
    const today = new Date().toISOString().slice(0, 10);
    const chain = buildSelectChain({
      data: [
        { start_ts: `${today}T08:00:00.000Z`, final_score: 80, achieved_minutes: 30 },
        { start_ts: `${today}T18:00:00.000Z`, final_score: 60, achieved_minutes: 50 },
      ],
      error: null,
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const history = await getSessionHistory(2);

    expect(supabase.from).toHaveBeenCalledWith("sessions");
    expect(chain.select).toHaveBeenCalledWith("start_ts, final_score, achieved_minutes");
    expect(chain.gte).toHaveBeenCalledWith("start_ts", expect.any(String));
    expect(chain.not).toHaveBeenCalledWith("end_ts", "is", null);
    expect(chain.order).toHaveBeenCalledWith("start_ts", { ascending: true });

    const day = history.find((d) => d.date === today);
    expect(day).toEqual({ date: today, avgScore: 70, totalMinutes: 80, bestMinutes: 50 });
  });

  it("throws when the query errors", async () => {
    const { supabase } = await import("./supabase");
    const chain = buildSelectChain({ data: null, error: { message: "boom" } });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await expect(getSessionHistory(2)).rejects.toThrow("boom");
  });

  it("falls back to sample data when no sessions exist yet", async () => {
    const { supabase } = await import("./supabase");
    const chain = buildSelectChain({ data: [], error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const history = await getSessionHistory(14);

    expect(history).toHaveLength(14);
    expect(history.some((d) => d.avgScore !== null)).toBe(true);
    // Sample data always ends on an active streak so the demo Trends tab looks alive.
    expect(computeStreak(history)).toBeGreaterThan(0);
    expect(totalQuietHours(history)).toBeGreaterThan(0);
    expect(bestSessionMinutes(history)).toBeGreaterThan(0);
  });
});
