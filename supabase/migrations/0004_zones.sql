create table public.zones (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  name text not null,
  geofence geography(Polygon, 4326) not null,
  silence_contract jsonb not null default '{}'::jsonb,
  reward_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zones_geofence_vertex_cap check (st_npoints(geofence::geometry) <= 64)
);

create index zones_geofence_gix on public.zones using gist (geofence);

alter table public.zones enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match).
grant select, insert, update, delete on public.zones to authenticated;

-- zone discovery is public for any signed-in user (map screen, U1)
create policy "zones_select_all_authenticated" on public.zones
  for select to authenticated using (true);

create policy "zones_insert_own" on public.zones
  for insert with check (operator_id = auth.uid());

create policy "zones_update_own" on public.zones
  for update using (operator_id = auth.uid());

create policy "zones_delete_own" on public.zones
  for delete using (operator_id = auth.uid());
