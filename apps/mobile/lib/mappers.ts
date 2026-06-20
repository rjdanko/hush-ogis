// Mirrors apps/dashboard/lib/mappers.ts -- Supabase JS returns raw snake_case
// DB columns; the app's components consistently use the camelCase
// @hush/shared-types shape. geofence:zones_geofence_geojson works around a
// `geography` column's default PostgREST serialization being raw WKB hex,
// not GeoJSON (supabase/migrations/0012_zones_geofence_geojson.sql).
import type { Session, Zone } from "@hush/shared-types";

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

export function toSession(row: {
  id: string;
  user_id: string;
  zone_id: string;
  start_ts: string;
  end_ts: string | null;
  intended_minutes: number | null;
  achieved_minutes: number | null;
  final_score: number | null;
  created_at: string;
}): Session {
  return {
    id: row.id,
    userId: row.user_id,
    zoneId: row.zone_id,
    startTs: row.start_ts,
    endTs: row.end_ts,
    intendedMinutes: row.intended_minutes,
    achievedMinutes: row.achieved_minutes,
    finalScore: row.final_score,
    createdAt: row.created_at,
  };
}
