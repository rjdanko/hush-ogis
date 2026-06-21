import { describe, expect, it, vi } from "vitest";
import { fetchLatestQuietIndex, subscribeToQuietIndex } from "./quietIndex";

function buildSelectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "tok-1" } } })),
    },
    realtime: {
      setAuth: vi.fn(),
    },
  },
}));

describe("fetchLatestQuietIndex", () => {
  it("returns the most recent quiet_index value for the zone", async () => {
    const { supabase } = await import("./supabase");
    const chain = buildSelectChain({ data: { value: 73 }, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const value = await fetchLatestQuietIndex("zone-1");

    expect(supabase.from).toHaveBeenCalledWith("quiet_index");
    expect(chain.eq).toHaveBeenCalledWith("zone_id", "zone-1");
    expect(chain.order).toHaveBeenCalledWith("ts", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(value).toBe(73);
  });

  it("returns null when quorum has never been met for the zone", async () => {
    const { supabase } = await import("./supabase");
    const chain = buildSelectChain({ data: null, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const value = await fetchLatestQuietIndex("zone-1");
    expect(value).toBeNull();
  });

  it("throws when the query errors", async () => {
    const { supabase } = await import("./supabase");
    const chain = buildSelectChain({ data: null, error: { message: "boom" } });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await expect(fetchLatestQuietIndex("zone-1")).rejects.toThrow();
  });
});

describe("subscribeToQuietIndex", () => {
  it("syncs the session token to realtime before opening a filtered postgres_changes channel", async () => {
    const { supabase } = await import("./supabase");
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
      unsubscribe: vi.fn(),
    };
    (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel);

    const onUpdate = vi.fn();
    const unsubscribe = subscribeToQuietIndex("zone-1", onUpdate);
    await new Promise((resolve) => setImmediate(resolve));

    expect(supabase.auth.getSession).toHaveBeenCalled();
    expect(supabase.realtime.setAuth).toHaveBeenCalledWith("tok-1");
    expect(supabase.channel).toHaveBeenCalledWith("quiet-index:zone-1");
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "quiet_index", filter: "zone_id=eq.zone-1" },
      expect.any(Function)
    );

    const handler = (channel.on as ReturnType<typeof vi.fn>).mock.calls[0][2];
    handler({ new: { value: 88 } });
    expect(onUpdate).toHaveBeenCalledWith(88);

    unsubscribe();
    expect(channel.unsubscribe).toHaveBeenCalled();
  });
});
