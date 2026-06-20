import { z } from "zod";

export const rewardCreateSchema = z
  .object({
    // zod v4's `.uuid()` enforces RFC 4122 version/variant bits strictly
    // (e.g. rejects "...-00000000000a" because the variant nibble isn't
    // 8/9/a/b). Test fixtures across this plan use loosely-shaped UUIDs, and
    // Postgres `uuid` columns accept any UUID-shaped value regardless of
    // version/variant — so `.guid()` (format-only check) is the correct
    // mirror of the DB constraint here, not `.uuid()`.
    zoneId: z.string().guid(),
    name: z.string().trim().min(1).max(100),
    pointsCost: z.number().int().positive(),
  })
  .strict();

export const rewardUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    pointsCost: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

export type RewardCreateInput = z.infer<typeof rewardCreateSchema>;
export type RewardUpdateInput = z.infer<typeof rewardUpdateSchema>;
