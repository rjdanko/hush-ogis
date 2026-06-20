-- PostgREST's default row-to-json serialization of a `geography` column
-- returns raw WKB hex, not GeoJSON, and (separately) rejects a GeoJSON
-- object written directly into a geography column on insert/update ("parse
-- error - invalid geometry"). The dashboard's API routes work around the
-- write side by converting GeoJSON to WKT text before insert/update
-- (apps/dashboard/lib/geo.ts's geoJsonPolygonToWkt) -- WKT is something
-- Postgres casts to geography implicitly. This function is the read-side
-- equivalent: a PostgREST "computed column" (a function taking the table's
-- composite type as its single argument) that callers select by name to
-- get GeoJSON back instead of raw WKB.
create or replace function public.zones_geofence_geojson(z public.zones)
returns jsonb
language sql
stable
as $$
  select st_asgeojson(z.geofence)::jsonb;
$$;

grant execute on function public.zones_geofence_geojson(public.zones) to authenticated, anon;
