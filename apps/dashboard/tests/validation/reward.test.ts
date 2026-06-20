import { describe, expect, it } from "vitest";
import { rewardCreateSchema, rewardUpdateSchema } from "../../lib/validation/reward";

describe("rewardCreateSchema", () => {
  it("accepts a valid reward payload", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "Free coffee",
      pointsCost: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive pointsCost", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "Free coffee",
      pointsCost: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid zoneId", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "not-a-uuid",
      name: "Free coffee",
      pointsCost: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = rewardCreateSchema.safeParse({
      zoneId: "00000000-0000-0000-0000-00000000000a",
      name: "",
      pointsCost: 50,
    });
    expect(result.success).toBe(false);
  });
});

describe("rewardUpdateSchema", () => {
  it("accepts a partial update (pointsCost only)", () => {
    const result = rewardUpdateSchema.safeParse({ pointsCost: 75 });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = rewardUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
