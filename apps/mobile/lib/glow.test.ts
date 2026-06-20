import { describe, expect, it } from "vitest";
import { quietIndexGlowColor } from "./glow";

describe("quietIndexGlowColor", () => {
  it("returns cool grey-blue for low quiet (0-30)", () => {
    expect(quietIndexGlowColor(0)).toBe("#8A98A6");
    expect(quietIndexGlowColor(30)).toBe("#8A98A6");
  });

  it("returns warm amber for medium quiet (31-70)", () => {
    expect(quietIndexGlowColor(31)).toBe("#D9A85E");
    expect(quietIndexGlowColor(70)).toBe("#D9A85E");
  });

  it("returns full warm glow for high quiet (71-100)", () => {
    expect(quietIndexGlowColor(71)).toBe("#E8C170");
    expect(quietIndexGlowColor(100)).toBe("#E8C170");
  });

  it("clamps out-of-range values instead of throwing", () => {
    expect(quietIndexGlowColor(-5)).toBe("#8A98A6");
    expect(quietIndexGlowColor(150)).toBe("#E8C170");
  });
});
