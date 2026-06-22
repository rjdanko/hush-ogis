-- Lightweight audit logging for sensitive actions not already covered
-- elsewhere (SR-13, PRD §11.5). Reward disbursement/redemption already has
-- its own immutable, write-only-via-server-function audit trail in
-- public.redemptions (0021_redemptions.sql) -- this migration does NOT
-- duplicate that. The two remaining gaps are zone deletion and role
-- changes, both of which can only happen via a direct table operation
-- (zones are deleted straight through RLS, not a SECURITY DEFINER
-- function -- see zones_delete_own in 0004_zones.sql), so the only place
-- to hook an audit write is a trigger on the table itself.
-- actor_id/target_id intentionally carry no foreign key: audit rows must
-- survive deletion of the actor/target they describe (e.g. via
-- delete_my_data's cascading erasure), so they stay valid, readable history
-- even after the referenced user no longer exists.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  -- nullable: a role change made in a service-role/superuser context (no
  -- client JWT) has no auth.uid() to record -- see log_role_change() below.
  actor_id uuid,
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Deny-by-default: no policies for authenticated/anon and no grants at
-- all. Only service_role (BYPASSRLS) can read this table; there is no
-- direct-client read path, audited or otherwise. (Contrast with
-- redemptions, which authenticated users can read their own rows of --
-- audit_log carries no per-user behavioural data and has no owner column
-- to scope a policy to, so the right answer is simply no access.)

-- zone_delete: fires after a zone row is gone, so it cannot read
-- anything off the now-deleted row except what's in OLD. No zone name,
-- geofence, or reward_config is logged -- only the id. SECURITY DEFINER
-- is required because the deleting role (authenticated) has no grant on
-- audit_log at all.
create or replace function public.log_zone_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, target_id)
  values (auth.uid(), 'zone_delete', old.id);
  return old;
end;
$$;

-- This trigger runs after delete inside the same transaction as the zone
-- deletion: if log_zone_delete() raises, the whole delete rolls back. That
-- is fail-closed by design (an unaudited zone deletion is worse than a
-- blocked one) -- not an unrelated bug if a future change to this trigger
-- ever causes a zone delete to start failing.
create trigger zones_audit_delete
  after delete on public.zones
  for each row execute function public.log_zone_delete();

revoke all on function public.log_zone_delete() from public, anon, authenticated;

-- role_change: prevent_role_self_escalation() (0002_roles_and_users.sql)
-- already guarantees only service_role or a direct superuser/seed session
-- can reach this point, so auth.uid() may legitimately be null (a
-- service-role JWT carries no `sub` claim, and a superuser session carries
-- no JWT claims at all -- the same condition that function checks via
-- auth.role() is null). We log auth.uid() directly with NO fallback: in the
-- realistic admin-promotion case (operator tooling using the service-role
-- key) auth.uid() is null, and falling back to new.id would write a row
-- that reads "this user changed their own role" -- which is impossible per
-- the escalation guard above, and is exactly the kind of audit-trail
-- corruption SR-13 exists to prevent. A null actor_id here is honest,
-- useful information: "no client JWT present -- service-role/superuser
-- context." old.role/new.role are included as details: these are
-- authorization attributes, not behavioural/usage data, so logging them
-- does not violate the "no behavioural data" constraint, and they're the
-- one thing that makes this audit row actually useful.
create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, target_id, details)
  values (auth.uid(), 'role_change', new.id,
          jsonb_build_object('old_role', old.role, 'new_role', new.role));
  return new;
end;
$$;

create trigger users_audit_role_change
  after update on public.users
  for each row
  when (old.role is distinct from new.role)
  execute function public.log_role_change();

revoke all on function public.log_role_change() from public, anon, authenticated;
