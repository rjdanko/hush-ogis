import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  }),
}));

import { POST } from "../../app/api/digest/route";

const AI_SERVICE_URL = "http://ai-service.test";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/digest", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_SERVICE_URL = AI_SERVICE_URL;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "access-token-123" } } });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/digest", () => {
  it("returns 401 when there is no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the body lacks zoneId", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-user rate limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "rate-limit-user" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ summary: "ok", suggestions: [] }),
    });
    let lastResponse;
    for (let i = 0; i < 6; i++) {
      lastResponse = await POST(jsonRequest({ zoneId: "zone-1" }));
    }
    expect(lastResponse!.status).toBe(429);
  });

  it("relays the upstream digest JSON on the happy path with the Bearer header", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "happy-user" } } });
    const digest = { summary: "A calm week.", suggestions: [{ title: "Keep going", body: "Steady." }] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => digest,
    });

    const response = await POST(jsonRequest({ zoneId: "zone-42" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(digest);

    expect(fetch).toHaveBeenCalledWith(
      `${AI_SERVICE_URL}/zones/zone-42/digest`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token-123" }),
      })
    );
  });

  it("returns 502 when the upstream responds non-ok (without relaying its body)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-502" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error", secret: "leak" }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to generate digest" });
    expect(JSON.stringify(body)).not.toContain("leak");
  });
});
