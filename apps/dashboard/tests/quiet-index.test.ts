import { describe, expect, it } from "vitest";
import { fetchLatestQuietIndex, formatQuietIndex } from "../lib/quiet-index";

describe("formatQuietIndex", () => {
  it("shows an em dash when quorum (SR-10) has never been met", () => {
    expect(formatQuietIndex(null)).toBe("—");
  });

  it("renders a rounded value out of 100", () => {
    expect(formatQuietIndex(73.4)).toBe("73/100");
    expect(formatQuietIndex(73.6)).toBe("74/100");
  });

  it("clamps to the 0-100 range", () => {
    expect(formatQuietIndex(-5)).toBe("0/100");
    expect(formatQuietIndex(105)).toBe("100/100");
  });
});

describe("fetchLatestQuietIndex", () => {
  function fakeSupabase(data: unknown, error: unknown = null) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data, error }),
              }),
            }),
          }),
        }),
      }),
    } as never;
  }

  it("returns nulls when there is no row yet", async () => {
    const result = await fetchLatestQuietIndex(fakeSupabase(null), "zone-1");
    expect(result).toEqual({ value: null, activeCount: null });
  });

  it("returns the value and active count from the latest row", async () => {
    const result = await fetchLatestQuietIndex(fakeSupabase({ value: 73.4, active_count: 5 }), "zone-1");
    expect(result).toEqual({ value: 73.4, activeCount: 5 });
  });

  it("throws when the query errors", async () => {
    await expect(fetchLatestQuietIndex(fakeSupabase(null, new Error("boom")), "zone-1")).rejects.toThrow("boom");
  });
});
