create table public.quiet_index (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  ts timestamptz not null default now(),
  value numeric not null check (value between 0 and 100),
  active_count int not null check (active_count >= 0)
);

alter table public.quiet_index enable row level security;

-- public read: app map + dashboard live feed both display this
grant select on public.quiet_index to authenticated;

create policy "quiet_index_select_all" on public.quiet_index
  for select to authenticated using (true);

-- deliberately no insert/update/delete grant or policy: only service_role
-- (bypasses RLS and grants entirely) may write rollups, enforced server-side
-- by the Phase 5 aggregation engine (SR-10)
