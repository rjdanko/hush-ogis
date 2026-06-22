-- supabase/tests/database/023_audit_log.sql
-- Fixture tests for public.audit_log (0026_audit_log.sql), the SR-13
-- audit trail for the two sensitive actions not already covered by an
-- existing audit mechanism (reward redemption already has its own
-- write-only audit table, public.redemptions -- see 0021_redemptions.sql):
-- zone deletion and role changes. No behavioural data is asserted here
-- because none should ever be written -- only id-shaped columns.
begin;
select plan(10);

select tests.create_test_user('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'::uuid); -- operator (deletes own zone)
select tests.create_test_user('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'::uuid); -- subject of a role change

reset role;
insert into public.operators (id, venue_name) values
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', 'Op')
on conflict do nothing;
insert into public.zones (id, operator_id, name, geofence) values (
  'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3',
  'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
  'Zone',
  st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))')
);

-- (a) zone deletion writes exactly one audit_log row
set local role authenticated;
select tests.authenticate_as('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'::uuid);

select lives_ok(
  $$ delete from public.zones where id = 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3' $$,
  'the owning operator can delete their own zone'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.audit_log where action = 'zone_delete' and target_id = 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3'),
  1,
  'deleting a zone writes exactly one audit_log row with action=zone_delete and the correct target_id'
);

select is(
  (select actor_id from public.audit_log where action = 'zone_delete' and target_id = 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3'),
  'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'::uuid,
  'the zone_delete audit row records the deleting operator as actor_id'
);

select is(
  (select details from public.audit_log where action = 'zone_delete' and target_id = 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3'),
  null,
  'the zone_delete audit row has a null details column (no behavioural data leaks via details)'
);

-- (b) a service_role-context role change writes exactly one audit_log row
-- (role changes can only happen via service_role/superuser context -- see
-- prevent_role_self_escalation() in 0002_roles_and_users.sql -- so this
-- mirrors 001_users_rls.sql's own superuser-role-change assertion).
update public.users set role = 'operator' where id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

select is(
  (select count(*)::int from public.audit_log where action = 'role_change' and target_id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'),
  1,
  'a role change on public.users writes exactly one audit_log row with action=role_change'
);

-- this update ran in a service-role/superuser context (no client JWT, so
-- auth.uid() is null) -- it must NOT fall back to recording new.id as the
-- actor, since that would falsely claim the user changed their own role,
-- which prevent_role_self_escalation() makes impossible. A null actor_id
-- is the only honest statement here.
select is(
  (select actor_id from public.audit_log where action = 'role_change' and target_id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'),
  null,
  'a role change made with no client JWT present (service-role/superuser context) records a null actor_id, not the subject as a misleading fallback'
);

select is(
  (select details from public.audit_log where action = 'role_change' and target_id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'),
  jsonb_build_object('old_role', 'user', 'new_role', 'operator'),
  'the role_change audit row details contain the actual old_role/new_role values'
);

-- (c) deny-by-default: authenticated and anon have no select privilege on audit_log
select isnt(
  has_table_privilege('authenticated', 'public.audit_log', 'select'),
  true,
  'authenticated role has no select privilege on audit_log (deny-by-default)'
);

select isnt(
  has_table_privilege('anon', 'public.audit_log', 'select'),
  true,
  'anon role has no select privilege on audit_log (deny-by-default)'
);

-- a no-op update (role unchanged) must NOT write an audit row -- pins down
-- the `when (old.role is distinct from new.role)` trigger condition.
update public.users set anon_handle = anon_handle where id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

select is(
  (select count(*)::int from public.audit_log where action = 'role_change' and target_id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'),
  1,
  'an update that does not change role does not write a second audit_log row'
);

select * from finish();
rollback;
