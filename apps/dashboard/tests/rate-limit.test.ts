import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("user-1", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
  });

  it("blocks the request once the limit is exceeded", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-2", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-2", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("resets the count after the window elapses", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("user-3", "zones:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-4", "zones:write", { limit: 5, windowMs: 60_000 });
    }
    expect(checkRateLimit("user-4", "rewards:write", { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
  });
});
