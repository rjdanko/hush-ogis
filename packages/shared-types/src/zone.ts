// Mirrors public.zones (supabase/migrations/0004_zones.sql).
//
// `geofence` is a `geography(Polygon, 4326)` column in Postgres/PostGIS. This
// GeoJsonPolygon type describes the GeoJSON representation as returned by
// PostgREST/Supabase client reads (and accepted on writes) — not the raw
// PostGIS wire format.
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

// `silence_contract` and `reward_config` are `jsonb not null default '{}'`
// columns — the DB does not enforce an internal shape, only that the column
// itself is present and non-null. These interfaces are the app-level contract
// the three Hush apps agree to read/write; they are not DB constraints.
export interface SilenceContract {
  committed_minutes: number;
}

export interface RewardConfig {
  reward_name: string;
  zone_hours_required: number;
}

export interface Zone {
  id: string;
  operatorId: string;
  name: string;
  geofence: GeoJsonPolygon;
  silenceContract: SilenceContract;
  rewardConfig: RewardConfig;
  createdAt: string;
}
