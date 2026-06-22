import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  }),
}));

import { POST } from "../../app/api/badge-token/route";

const AI_SERVICE_URL = "http://ai-service.test";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/badge-token", {
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

describe("POST /api/badge-token", () => {
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

  it("builds an embedUrl from the minted token on the happy path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "happy-user" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "signed.jwt.token", expires_in: 300 }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-42" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      embedUrl: `${AI_SERVICE_URL}/badge/signed.jwt.token`,
      expiresIn: 300,
    });

    expect(fetch).toHaveBeenCalledWith(
      `${AI_SERVICE_URL}/zones/zone-42/badge-token`,
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
      status: 422,
      json: async () => ({ detail: "insufficient_data" }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to generate badge" });
  });
});
