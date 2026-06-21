import { describe, expect, it } from "vitest";
import { formatQuietIndex } from "../lib/quiet-index";

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
