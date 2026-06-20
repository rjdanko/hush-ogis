import { describe, expect, it } from "vitest";
import { validateIntendedMinutes } from "./validation";

describe("validateIntendedMinutes", () => {
  it("accepts null (no intention set)", () => {
    expect(validateIntendedMinutes(null)).toEqual({ ok: true });
  });

  it("accepts values within 1-480", () => {
    expect(validateIntendedMinutes(1)).toEqual({ ok: true });
    expect(validateIntendedMinutes(45)).toEqual({ ok: true });
    expect(validateIntendedMinutes(480)).toEqual({ ok: true });
  });

  it("rejects 0 or negative values", () => {
    expect(validateIntendedMinutes(0)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
    expect(validateIntendedMinutes(-10)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });

  it("rejects values over 480", () => {
    expect(validateIntendedMinutes(481)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });

  it("rejects non-finite values", () => {
    expect(validateIntendedMinutes(NaN)).toEqual({ ok: false, reason: "Quiet time must be between 1 and 480 minutes." });
  });
});
