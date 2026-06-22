-- Lightweight audit logging for sensitive actions not already covered
-- elsewhere (SR-13, PRD §11.5). Reward disbursement/redemption already has
-- its own immutable, write-only-via-server-function audit trail in
-- public.redemptions (0021_redemptions.sql) -- this migration does NOT
-- duplicate that. The two remaining gaps are zone deletion and role
-- changes, both of which can only happen via a direct table operation
-- (zones are deleted straight through RLS, not a SECURITY DEFINER
-- function -- see zones_delete_own in 0004_zones.sql), so the only place
-- to hook an audit write is a trigger on the table itself.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
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

create trigger zones_audit_delete
  after delete on public.zones
  for each row execute function public.log_zone_delete();

revoke all on function public.log_zone_delete() from public, anon, authenticated;

-- role_change: prevent_role_self_escalation() (0002_roles_and_users.sql)
-- already guarantees only service_role or a direct superuser/seed session
-- can reach this point, so auth.uid() may legitimately be null (a
-- superuser session carries no JWT claims at all -- the same condition
-- that function checks via auth.role() is null). When auth.uid() is null
-- there is no separate "actor" identity to log, so we fall back to
-- new.id: the most meaningful statement we can make in that context is
-- "this user's own role changed," which is exactly what target_id already
-- records -- coalescing actor_id to new.id makes that explicit rather than
-- leaving a misleading null. old.role/new.role are included as details:
-- these are authorization attributes, not behavioural/usage data, so
-- logging them does not violate the "no behavioural data" constraint, and
-- they're the one thing that makes this audit row actually useful.
create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, target_id, details)
  values (coalesce(auth.uid(), new.id), 'role_change', new.id,
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
