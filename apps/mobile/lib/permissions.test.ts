import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../modules/silence-signals", () => ({
  hasUsageAccessPermission: vi.fn(),
}));

describe("needsSilenceAgentOnboarding", () => {
  // The iOS test below mutates the shared mocked Platform object directly
  // (vi.doMock was tried first but leaks its override into later tests in
  // this file, since the registry isn't reset between tests) -- reset back
  // to the mock's Android default here so later tests aren't affected.
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
