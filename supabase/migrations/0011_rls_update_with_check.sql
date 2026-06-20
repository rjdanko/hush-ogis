-- zones_update_own and rewards_update_own_zone (0004_zones.sql, 0008_rewards.sql)
-- only had a `using` clause, which RLS checks against the PRE-update row --
-- it does not re-validate the row a caller is trying to write. An operator
-- could therefore UPDATE their own zone's `operator_id` to someone else's
-- (or their own reward's `zone_id` to a zone they don't own) and RLS would
-- never re-check that the resulting row still satisfies the policy. Adding
-- a matching `with check` closes this: Postgres requires both the existing
-- row (`using`) and the new row (`with check`) to satisfy the same predicate.
drop policy "zones_update_own" on public.zones;
create policy "zones_update_own" on public.zones
  for update
  using (operator_id = auth.uid())
  with check (operator_id = auth.uid());

drop policy "rewards_update_own_zone" on public.rewards;
create policy "rewards_update_own_zone" on public.rewards
  for update
  using (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  )
  with check (
    exists (select 1 from public.zones z where z.id = rewards.zone_id and z.operator_id = auth.uid())
  );
