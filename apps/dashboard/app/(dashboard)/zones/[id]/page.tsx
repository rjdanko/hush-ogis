import { createClient } from "../../../../lib/supabase/server";
import { ZoneEditClient } from "./zone-edit-client";

export default async function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zoneRow } = await supabase
    .from("zones")
    .select("id, operator_id, name, geofence, silence_contract, reward_config, created_at")
    .eq("id", id)
    .single();
  const { data: rewardRows } = await supabase
    .from("rewards")
    .select("id, zone_id, name, points_cost, created_at")
    .eq("zone_id", id);

  if (!zoneRow) {
    return <p>Zone not found.</p>;
  }

  // Supabase JS returns raw DB column names (snake_case). The dashboard's
  // client components consistently use the camelCase @hush/shared-types
  // shape (Zone, Reward), so we map at this server/client boundary -- the
  // one place raw rows are read -- rather than letting snake_case leak into
  // ZoneEditClient and mixing with the camelCase rows the API routes return
  // on POST.
  const zone = {
    id: zoneRow.id,
    operatorId: zoneRow.operator_id,
    name: zoneRow.name,
    geofence: zoneRow.geofence,
    silenceContract: zoneRow.silence_contract,
    rewardConfig: zoneRow.reward_config,
    createdAt: zoneRow.created_at,
  };

  const rewards = (rewardRows ?? []).map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    pointsCost: row.points_cost,
    createdAt: row.created_at,
  }));

  return <ZoneEditClient zone={zone} rewards={rewards} />;
}
