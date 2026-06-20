-- Geofence check (U2): is a given lat/lng inside a zone's polygon? Always
-- parameterized (SR-6) -- never build geometry literals by string
-- concatenation. security invoker so the caller's own zones_select_all_
-- authenticated RLS grant (0004_zones.sql) governs which zone rows are
-- visible; this function adds no privilege beyond that.
create or replace function public.zone_contains_point(
  p_zone_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql
stable
security invoker
as $$
  select st_contains(
    z.geofence::geometry,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  )
  from public.zones z
  where z.id = p_zone_id;
$$;

grant execute on function public.zone_contains_point(uuid, double precision, double precision) to authenticated;
