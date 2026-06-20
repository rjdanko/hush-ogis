// Supabase JS returns raw DB column names (snake_case); the dashboard's
// client components consistently use the camelCase @hush/shared-types shape.
// Centralized here so the two places that map a raw row (the zone detail
// page's initial server-side load, and a fresh POST /api/rewards response)
// can't silently drift if a column/field is ever added to one but not the other.
import type { Reward, Zone } from "@hush/shared-types";

// Single source of truth for selecting a zone row in the shape toZone()
// below expects. geofence:zones_geofence_geojson -- a `geography` column's
// default PostgREST serialization is raw WKB hex, not GeoJSON; this computed
// column (supabase/migrations/0012_zones_geofence_geojson.sql) converts it.
export const ZONE_SELECT =
  "id, operator_id, name, geofence:zones_geofence_geojson, silence_contract, reward_config, created_at";

export function toZone(row: {
  id: string;
  operator_id: string;
  name: string;
  geofence: Zone["geofence"];
  silence_contract: Zone["silenceContract"];
  reward_config: Zone["rewardConfig"];
  created_at: string;
}): Zone {
  return {
    id: row.id,
    operatorId: row.operator_id,
    name: row.name,
    geofence: row.geofence,
    silenceContract: row.silence_contract,
    rewardConfig: row.reward_config,
    createdAt: row.created_at,
  };
}

export function toReward(row: {
  id: string;
  zone_id: string;
  name: string;
  points_cost: number;
  created_at: string;
}): Reward {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    pointsCost: row.points_cost,
    createdAt: row.created_at,
  };
}
