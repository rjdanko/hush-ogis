import { z } from "zod";
import { validatePolygonRing, type Point } from "../geo";

const pointSchema: z.ZodType<Point> = z.tuple([z.number(), z.number()]);

const geoJsonPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(pointSchema)).length(1, "Only single-ring polygons are supported (no holes)."),
  })
  .superRefine((polygon, ctx) => {
    // Deliberately validate the ring as submitted, without pre-closing it
    // via `closeRing` first: GeoJSON polygons are required to already be a
    // closed ring (first point === last point), so closing it here would
    // silently paper over a client sending an invalid/incomplete polygon.
    // `closeRing` exists in lib/geo.ts for callers (e.g. map-drawing UI)
    // that intentionally tolerate unclosed input — this API-validation path
    // is not one of them.
    const ring = polygon.coordinates[0]!;
    const result = validatePolygonRing(ring);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.reason, path: ["coordinates"] });
    }
  });

const silenceContractSchema = z
  .object({
    suggested_minutes: z.number().int().positive().optional(),
  })
  .strict();

const rewardConfigSchema = z
  .object({
    earn_rate_per_quiet_minute: z.number().positive(),
    min_score_for_earning: z.number().min(0).max(100),
    daily_point_cap: z.number().int().positive().optional(),
  })
  .strict();

export const zoneCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    geofence: geoJsonPolygonSchema,
    silenceContract: silenceContractSchema,
    rewardConfig: rewardConfigSchema,
  })
  .strict();

export const zoneUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    geofence: geoJsonPolygonSchema.optional(),
    silenceContract: silenceContractSchema.optional(),
    rewardConfig: rewardConfigSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdateInput = z.infer<typeof zoneUpdateSchema>;
