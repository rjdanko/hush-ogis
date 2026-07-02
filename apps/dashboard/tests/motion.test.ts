import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePrefersReducedMotion } from "../lib/motion";

function makeMql(matches: boolean) {
  const listeners: Array<() => void> = [];
  return {
    matches,
    addEventListener: (_: string, cb: () => void) => { listeners.push(cb); },
    removeEventListener: (_: string, cb: () => void) => {
      const i = listeners.indexOf(cb);
      if (i !== -1) listeners.splice(i, 1);
    },
  };
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    // Clean up the matchMedia mock
    Object.defineProperty(window, "matchMedia", { value: undefined, writable: true, configurable: true });
  });

  it("returns false when reduced motion is not preferred", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => makeMql(false),
    });
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when reduced motion is preferred", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => makeMql(true),
    });
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});
