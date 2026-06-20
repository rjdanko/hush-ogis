import { describe, expect, it, vi } from "vitest";
import { sendScorePing } from "./ingest";

vi.mock("./supabase", () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) },
}));

describe("sendScorePing", () => {
  it("calls the ingest RPC with exactly the four allowed fields", async () => {
    const { supabase } = await import("./supabase");
    await sendScorePing({
      anonSessionToken: "tok-1",
      zoneId: "zone-1",
      score: 72,
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("ingest_score_ping", {
      p_anon_token: "tok-1",
      p_zone_id: "zone-1",
      p_score: 72,
      p_ts: "2026-01-01T00:00:00.000Z",
    });
    const callArgs = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(Object.keys(callArgs).sort()).toEqual(["p_anon_token", "p_score", "p_ts", "p_zone_id"]);
  });

  it("throws when the RPC returns an error", async () => {
    const { supabase } = await import("./supabase");
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "invalid or inactive session" },
    });
    await expect(
      sendScorePing({ anonSessionToken: "tok-1", zoneId: "zone-1", score: 50, ts: "2026-01-01T00:00:00.000Z" })
    ).rejects.toThrow("invalid or inactive session");
  });
});
