import { createClient } from "../../../../lib/supabase/server";
import { toReward, toZone } from "../../../../lib/mappers";
import { ZoneEditClient } from "./zone-edit-client";

export default async function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zoneRow } = await supabase
    .from("zones")
    // geofence:zones_geofence_geojson -- a `geography` column's default
    // PostgREST serialization is raw WKB hex, not GeoJSON (see
    // supabase/migrations/0012_zones_geofence_geojson.sql for the computed
    // column that converts it, and app/api/zones/route.ts for the write side).
    .select("id, operator_id, name, geofence:zones_geofence_geojson, silence_contract, reward_config, created_at")
    .eq("id", id)
    .single();
  const { data: rewardRows } = await supabase
    .from("rewards")
    .select("id, zone_id, name, points_cost, created_at")
    .eq("zone_id", id);

  if (!zoneRow) {
    return <p>Zone not found.</p>;
  }

  const zone = toZone(zoneRow);
  const rewards = (rewardRows ?? []).map(toReward);

  return <ZoneEditClient zone={zone} rewards={rewards} />;
}
