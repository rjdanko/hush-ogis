import { createClient } from "../../../../lib/supabase/server";
import { toReward, toZone, ZONE_SELECT } from "../../../../lib/mappers";
import { ZoneEditClient } from "./zone-edit-client";

export default async function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zoneRow } = await supabase.from("zones").select(ZONE_SELECT).eq("id", id).single();
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
