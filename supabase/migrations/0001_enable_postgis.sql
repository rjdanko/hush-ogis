-- Enable PostGIS for geofencing (zone polygons, point-in-polygon check-in).
-- Schema + RLS policies are authored in Phase 1.
create extension if not exists postgis;
