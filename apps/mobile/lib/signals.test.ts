import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../modules/silence-signals", () => ({
  getNativeSignals: vi.fn(),
}));

describe("getSilenceSignals on iOS", () => {
  it("returns an honor-system stub instead of calling the native module", async () => {
    const { getSilenceSignals } = await import("./signals");
    const { getNativeSignals } = await import("../modules/silence-signals");

    const signals = await getSilenceSignals(120_000);

    expect(getNativeSignals).not.toHaveBeenCalled();
    expect(signals).toEqual({ screenOffMs: 120_000, interruptionFilter: 1, isForeground: false });
  });
});
