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

-- TRUNCATE bypasses Row-Level Security entirely (Postgres never evaluates RLS
-- policies for TRUNCATE), so a table can be fully wiped by any role holding
-- the TRUNCATE privilege regardless of its RLS policies or the absence of
-- insert/update/delete grants. The local stack's default ACL for the
-- `postgres` role (the role our migrations run as) silently grants TRUNCATE
-- on every newly created public table to `anon`/`authenticated` alongside
-- references/trigger, with no explicit GRANT statement anywhere in this
-- repo's migrations. This is a quiet_index-specific landmine (SR-10 depends
-- on this table being fully unwritable by any client) but the underlying
-- default ACL gap affects every public table created so far, so the fix is
-- applied once, here, for all of them, plus the default itself so Tasks 9+
-- don't reintroduce it on new tables.
revoke truncate on public.users from anon, authenticated;
revoke truncate on public.operators from anon, authenticated;
revoke truncate on public.zones from anon, authenticated;
revoke truncate on public.sessions from anon, authenticated;
revoke truncate on public.score_pings from anon, authenticated;
revoke truncate on public.quiet_index from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- PostGIS-owned system tables (spatial_ref_sys, geometry_columns,
-- geography_columns) are deliberately left out of the revoke above: they
-- hold no Hush application data, have RLS disabled, are extension-owned
-- reference/catalog data, and predate this migration's default-privilege
-- change (which is not retroactive). Revoking TRUNCATE on them risks
-- interfering with PostGIS's own extension-upgrade/dump tooling for no
-- security benefit.
