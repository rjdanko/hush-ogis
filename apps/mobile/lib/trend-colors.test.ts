import { describe, expect, it } from "vitest";
import { sessionCellColor } from "./trend-colors";

describe("sessionCellColor", () => {
  it("returns no-session color for null", () => {
    expect(sessionCellColor(null)).toBe("#E4DDD1");
  });

  it("returns low color for score 0–30", () => {
    expect(sessionCellColor(0)).toBe("#C8C0B0");
    expect(sessionCellColor(15)).toBe("#C8C0B0");
    expect(sessionCellColor(30)).toBe("#C8C0B0");
  });

  it("returns medium color for score 31–70", () => {
    expect(sessionCellColor(31)).toBe("rgba(217,168,94,0.4)");
    expect(sessionCellColor(50)).toBe("rgba(217,168,94,0.4)");
    expect(sessionCellColor(70)).toBe("rgba(217,168,94,0.4)");
  });

  it("returns high color for score 71–89", () => {
    expect(sessionCellColor(71)).toBe("rgba(232,193,112,0.6)");
    expect(sessionCellColor(89)).toBe("rgba(232,193,112,0.6)");
  });

  it("returns full gold for score >= 90", () => {
    expect(sessionCellColor(90)).toBe("#E8C170");
    expect(sessionCellColor(100)).toBe("#E8C170");
  });
});
