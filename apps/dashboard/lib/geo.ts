// Mirrors the DB-side cap in supabase/migrations/0004_zones.sql
// (`zones_geofence_vertex_cap check (st_npoints(geofence::geometry) <= 64)`).
// This is defense in depth, not a substitute for the DB constraint.
export const MAX_POLYGON_VERTICES = 64;

export type Point = [number, number];

// PostgREST/PostGIS rejects a raw GeoJSON object written to a `geography`
// column (it tries to parse the JSON as WKT and errors with "invalid
// geometry") -- but it DOES accept WKT text, which Postgres casts
// implicitly. Convert at the API boundary before any insert/update.
export function geoJsonPolygonToWkt(polygon: { coordinates: Point[][] }): string {
  const ring = polygon.coordinates[0] ?? [];
  const points = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${points}))`;
}

export function closeRing(ring: Point[]): Point[] {
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }
  return first ? [...ring, first] : ring;
}

export type PolygonValidationResult = { ok: true } | { ok: false; reason: string };

export function validatePolygonRing(ring: Point[]): PolygonValidationResult {
  // A closed ring of N distinct vertices has N+1 points (first repeated as last).
  const distinctCount = ring.length > 0 ? ring.length - 1 : 0;
  if (distinctCount < 3) {
    return { ok: false, reason: "A polygon needs at least 3 distinct vertices." };
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { ok: false, reason: "Polygon ring must be closed (first point must equal last point)." };
  }
  if (ring.length > MAX_POLYGON_VERTICES) {
    return { ok: false, reason: `Polygon exceeds the ${MAX_POLYGON_VERTICES}-vertex cap.` };
  }
  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { ok: false, reason: "Coordinates must be finite numbers." };
    }
    if (lng < -180 || lng > 180) {
      return { ok: false, reason: "Longitude must be between -180 and 180." };
    }
    if (lat < -90 || lat > 90) {
      return { ok: false, reason: "Latitude must be between -90 and 90." };
    }
  }
  return { ok: true };
}
