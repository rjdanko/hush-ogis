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

import { POST } from "../../app/api/rewards/route";
import { PATCH, DELETE } from "../../app/api/rewards/[id]/route";

const validPayload = {
  zoneId: "00000000-0000-0000-0000-00000000000a",
  name: "Free coffee",
  pointsCost: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({
    single: () => Promise.resolve({ data: { id: "reward-1" }, error: null }),
    maybeSingle: () => Promise.resolve({ data: { id: "reward-1" }, error: null }),
  });
  mockEq.mockReturnValue({ select: mockSelect });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate, delete: mockDelete });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/rewards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/rewards", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({ ...validPayload, pointsCost: 0 }));
    expect(response.status).toBe(400);
  });

  it("inserts the reward via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest(validPayload));
    expect(response.status).toBe(201);
    expect(mockFrom).toHaveBeenCalledWith("rewards");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ zone_id: validPayload.zoneId, name: "Free coffee", points_cost: 50 })
    );
  });
});

describe("PATCH /api/rewards/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new Request("http://localhost/api/rewards/reward-1", {
      method: "PATCH",
      body: JSON.stringify({ pointsCost: 75 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(401);
  });

  it("updates via the session-scoped client on a valid payload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/rewards/reward-1", {
      method: "PATCH",
      body: JSON.stringify({ pointsCost: 75 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ points_cost: 75 }));
  });

  it("returns 404 when RLS filters the update to zero rows (not owned or doesn't exist)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelect.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    const request = new Request("http://localhost/api/rewards/reward-1", {
      method: "PATCH",
      body: JSON.stringify({ pointsCost: 75 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/rewards/[id]", () => {
  it("deletes via the session-scoped client when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const request = new Request("http://localhost/api/rewards/reward-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(204);
  });

  it("returns 404 when RLS filters the delete to zero rows (not owned or doesn't exist)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelect.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    const request = new Request("http://localhost/api/rewards/reward-1", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "reward-1" }) });
    expect(response.status).toBe(404);
  });
});
