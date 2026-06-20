import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { POST } from "../../app/api/zones/route";
import { PATCH, DELETE } from "../../app/api/zones/[id]/route";

const validPayload = {
  name: "Demo Cafe",
  geofence: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  silenceContract: { suggested_minutes: 45 },
  rewardConfig: { earn_rate_per_quiet_minute: 1, min_score_for_earning: 70 },
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/zones", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({
    single: () => Promise.resolve({ data: { id: "zone-1" }, error: null }),
    maybeSingle: () => Promise.resolve({ data: { id: "zone-1" }, error: null }),
  });
  mockEq.mockReturnValue({ select: mockSelect });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, delete: mockDelete });
});

describe("POST /api/zones", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({ name: "" }));
    expect(response.status).toBe(400);
  });

  it("inserts the zone using the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(201);
    expect(mockFrom).toHaveBeenCalledWith("zones");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ operator_id: "user-1", name: "Demo Cafe" })
    );
  });

  it("returns 429 once the per-user rate limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "rate-limit-user" } } });
    let lastResponse;
    for (let i = 0; i < 21; i++) {
      lastResponse = await POST(jsonRequest(validPayload));
    }
    expect(lastResponse!.status).toBe(429);
  });
});

describe("PATCH /api/zones/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/zones/zone-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(401);
  });

  it("updates via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/zones/zone-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
    expect(mockEq).toHaveBeenCalledWith("id", "zone-1");
  });

  it("returns 404 when RLS filters the update to zero rows (not owned or doesn't exist)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelect.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    const request = new Request("http://localhost/api/zones/zone-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/zones/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/zones/zone-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(401);
  });

  it("deletes via the session-scoped client when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/zones/zone-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(204);
    expect(mockEq).toHaveBeenCalledWith("id", "zone-1");
  });

  it("returns 404 when RLS filters the delete to zero rows (not owned or doesn't exist)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelect.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    const request = new Request("http://localhost/api/zones/zone-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "zone-1" }) });
    expect(response.status).toBe(404);
  });
});
