import type { Zone } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toZone, ZONE_SELECT } from "./mappers";

// Zone discovery (U1): zones_select_all_authenticated (0004_zones.sql) lets
// any authenticated user read every zone -- there is no operator scoping
// on the read side here, only on writes.
export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase.from("zones").select(ZONE_SELECT);
  if (error) throw error;
  return (data ?? []).map(toZone);
}
