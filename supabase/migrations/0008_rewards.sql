create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  points_cost int not null check (points_cost > 0),
  created_at timestamptz not null default now()
);

alter table public.rewards enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match). select
-- is needed by both policies below; insert/update/delete only by the owner-zone
-- policy, but Postgres grants are table-wide so authenticated gets all four and
-- RLS narrows actual row access per-policy.
grant select, insert, update, delete on public.rewards to authenticated;

-- reward browsing is public for any signed-in user (wallet redemption screen, U*)
create policy "rewards_select_all" on public.rewards
  for select to authenticated using (true);

-- split per-operation (rather than one FOR ALL policy) for consistency with
-- operators/zones/sessions, and so a future requirement that diverges
-- insert/update/delete rules is a one-line edit, not a policy split.
create policy "rewards_insert_own_zone" on public.rewards
  for insert with check (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

create policy "rewards_update_own_zone" on public.rewards
  for update using (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

create policy "rewards_delete_own_zone" on public.rewards
  for delete using (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );

-- TRUNCATE bypasses RLS entirely (see 0007_quiet_index.sql for the full
-- explanation). The default-privilege fix applied there is retroactive to the
-- `postgres` role's default ACL, so this new table should NOT inherit a
-- TRUNCATE grant — this revoke is defensive belt-and-suspenders, not expected
-- to find anything to revoke.
revoke truncate on public.rewards from anon, authenticated;
