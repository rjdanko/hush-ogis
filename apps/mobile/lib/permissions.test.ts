import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../modules/silence-signals", () => ({
  hasUsageAccessPermission: vi.fn(),
}));

describe("needsSilenceAgentOnboarding", () => {
  afterEach(() => {
    Platform.OS = "android";
  });

  it("is false on iOS regardless of permission state (no native agent there)", async () => {
    (Platform as { OS: string }).OS = "ios";
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    expect(await needsSilenceAgentOnboarding()).toBe(false);
  });

  it("is true on Android when usage access has not been granted", async () => {
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    const { hasUsageAccessPermission } = await import("../modules/silence-signals");
    (hasUsageAccessPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    expect(await needsSilenceAgentOnboarding()).toBe(true);
  });

  it("is false on Android once usage access is granted", async () => {
    const { needsSilenceAgentOnboarding } = await import("./permissions");
    const { hasUsageAccessPermission } = await import("../modules/silence-signals");
    (hasUsageAccessPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    expect(await needsSilenceAgentOnboarding()).toBe(false);
  });
});
