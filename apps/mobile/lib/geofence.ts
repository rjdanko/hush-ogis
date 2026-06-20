import { supabase } from "./supabase";

// U2: calls the server-side, parameterized point-in-polygon RPC
// (supabase/migrations/0014_zone_contains_point.sql, SR-6) -- never compute
// containment client-side as the source of truth, only the server's answer
// is trusted. Returns null when the check couldn't be determined (RPC error
// or unknown zone), which callers should treat as "offer manual confirm."
export async function checkInsideZone(zoneId: string, lat: number, lng: number): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("zone_contains_point", {
    p_zone_id: zoneId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) return null;
  return data;
}
