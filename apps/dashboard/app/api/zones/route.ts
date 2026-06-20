import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { zoneCreateSchema } from "../../../lib/validation/zone";
import { geoJsonPolygonToWkt } from "../../../lib/geo";

// PostgREST rejects a GeoJSON object written into a `geography` column
// outright ("parse error - invalid geometry") -- it only accepts WKT text,
// which Postgres casts implicitly. Read-back uses the zones_geofence_geojson
// computed column (supabase/migrations/0012_zones_geofence_geojson.sql) so
// the response shape still matches what clients expect (GeoJSON).
const ZONE_SELECT = "id, operator_id, name, geofence:zones_geofence_geojson, silence_contract, reward_config, created_at";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "zones:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = zoneCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("zones")
    .insert({
      operator_id: userData.user.id,
      name: parsed.data.name,
      geofence: geoJsonPolygonToWkt(parsed.data.geofence),
      silence_contract: parsed.data.silenceContract,
      reward_config: parsed.data.rewardConfig,
    })
    .select(ZONE_SELECT)
    .single();

  if (error) {
    // Don't leak raw Postgres/PostgREST error text (constraint/column names) to the client.
    console.error("POST /api/zones insert failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
