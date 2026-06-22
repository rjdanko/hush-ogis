import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "../lib/motion";

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the user's OS/browser prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when the user has no reduced-motion preference", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
    }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns false (SSR-safe fallback) when window.matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
